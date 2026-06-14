import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

function parseId(id: string): string {
  const r = z.uuid().safeParse(id);
  if (!r.success) throw new ApiError("NOT_FOUND", "Book not found", 404);
  return r.data;
}

const UpdateBookSchema = z.object({
  accessionNo: z.string().min(1).max(50).optional(),
  isbn: z.string().max(20).nullable().optional(),
  title: z.string().min(1).max(300).optional(),
  titleNe: z.string().max(300).nullable().optional(),
  author: z.string().max(200).nullable().optional(),
  authorNe: z.string().max(200).nullable().optional(),
  publisher: z.string().max(200).nullable().optional(),
  category: z.string().max(50).nullable().optional(),
  language: z.string().max(10).optional(),
  edition: z.string().max(50).nullable().optional(),
  pages: z.number().int().positive().nullable().optional(),
  pricePaisa: z.number().int().min(0).nullable().optional(),
  shelfLocation: z.string().max(50).nullable().optional(),
  copies: z.number().int().min(1).max(1000).optional(),
});

/** GET /api/library/books/[id] — book detail with recent issue history. */
export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantSession();

    const book = await withTenant(tenantId, async (tx) => {
      const row = await tx.libraryBook.findFirst({
        where: { tenantId, publicId: id, deletedAt: null },
        include: {
          issues: {
            orderBy: { issuedAt: "desc" },
            take: 20,
            include: {
              student: { select: { publicId: true, name: true, nameNe: true } },
              staff: { select: { publicId: true, name: true, nameNe: true } },
            },
          },
        },
      });
      if (!row) throw new ApiError("NOT_FOUND", "Book not found", 404);
      return row;
    });

    return ok(book);
  },
);

/** PATCH /api/library/books/[id] — update book fields. */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantWrite(["school_admin", "librarian"]);
    const body = await parseBody(req, UpdateBookSchema);

    const updated = await withTenant(tenantId, async (tx) => {
      const existing = await tx.libraryBook.findFirst({
        where: { tenantId, publicId: id, deletedAt: null },
      });
      if (!existing) throw new ApiError("NOT_FOUND", "Book not found", 404);

      // If accessionNo is changing, check uniqueness
      if (body.accessionNo && body.accessionNo !== existing.accessionNo) {
        const dup = await tx.libraryBook.findFirst({
          where: { tenantId, accessionNo: body.accessionNo, deletedAt: null },
        });
        if (dup) {
          throw new ApiError("DUPLICATE", "A book with this accession number already exists", 409);
        }
      }

      // If copies changed, adjust availableCopies proportionally
      let availableCopies = existing.availableCopies;
      if (body.copies !== undefined && body.copies !== existing.copies) {
        const issuedCount = existing.copies - existing.availableCopies;
        if (body.copies < issuedCount) {
          throw new ApiError(
            "VALIDATION_ERROR",
            `Cannot reduce copies below ${issuedCount} (currently issued)`,
            400,
          );
        }
        availableCopies = body.copies - issuedCount;
      }

      const row = await tx.libraryBook.update({
        where: { id: existing.id },
        data: {
          accessionNo: body.accessionNo,
          isbn: body.isbn,
          title: body.title,
          titleNe: body.titleNe,
          author: body.author,
          authorNe: body.authorNe,
          publisher: body.publisher,
          category: body.category,
          language: body.language,
          edition: body.edition,
          pages: body.pages,
          pricePaisa: body.pricePaisa,
          shelfLocation: body.shelfLocation,
          copies: body.copies,
          availableCopies: body.copies !== undefined ? availableCopies : undefined,
        },
      });

      await audit(tx, {
        tenantId,
        action: "update",
        entity: "library_book",
        entityId: row.publicId,
        before: {
          title: existing.title,
          accessionNo: existing.accessionNo,
          copies: existing.copies,
        },
        after: {
          title: row.title,
          accessionNo: row.accessionNo,
          copies: row.copies,
        },
      });

      return row;
    });

    return ok(updated);
  },
);

/** DELETE /api/library/books/[id] — soft-delete; only if no active issues. */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantWrite(["school_admin", "librarian"]);

    const deleted = await withTenant(tenantId, async (tx) => {
      const existing = await tx.libraryBook.findFirst({
        where: { tenantId, publicId: id, deletedAt: null },
      });
      if (!existing) throw new ApiError("NOT_FOUND", "Book not found", 404);

      // Block deletion if any copies are currently issued
      const activeIssues = await tx.libraryIssue.count({
        where: { tenantId, bookId: existing.id, status: "issued" },
      });
      if (activeIssues > 0) {
        throw new ApiError(
          "HAS_ACTIVE_ISSUES",
          `Cannot delete: ${activeIssues} copy/copies currently issued`,
          409,
        );
      }

      const row = await tx.libraryBook.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await audit(tx, {
        tenantId,
        action: "soft_delete",
        entity: "library_book",
        entityId: row.publicId,
        before: { title: existing.title, accessionNo: existing.accessionNo },
      });

      return row;
    });

    return ok({ publicId: deleted.publicId, deletedAt: deleted.deletedAt });
  },
);
