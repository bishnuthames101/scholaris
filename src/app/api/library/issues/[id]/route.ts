import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";
import { calculateFine } from "@/lib/library/fine";
import { librarySettingsOf } from "@/lib/library/settings";

function parseId(id: string): string {
  const r = z.uuid().safeParse(id);
  if (!r.success) throw new ApiError("NOT_FOUND", "Issue not found", 404);
  return r.data;
}

/** GET /api/library/issues/[id] — issue detail. */
export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantSession();

    const issue = await withTenant(tenantId, async (tx) => {
      const row = await tx.libraryIssue.findFirst({
        where: { tenantId, publicId: id },
        include: {
          book: { select: { publicId: true, title: true, accessionNo: true } },
          student: { select: { publicId: true, name: true, nameNe: true } },
          staff: { select: { publicId: true, name: true, nameNe: true } },
        },
      });
      if (!row) throw new ApiError("NOT_FOUND", "Issue not found", 404);
      return row;
    });

    return ok(issue);
  },
);

const ReturnSchema = z.object({
  action: z.enum(["return", "lost"]),
  fineCollected: z.boolean().optional(),
  note: z.string().max(500).optional(),
});

/** PATCH /api/library/issues/[id] — return a book or mark as lost. */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantWrite(["school_admin", "librarian"]);
    const body = await parseBody(req, ReturnSchema);

    const updated = await withTenant(tenantId, async (tx) => {
      const existing = await tx.libraryIssue.findFirst({
        where: { tenantId, publicId: id },
        include: {
          book: { select: { id: true, title: true, accessionNo: true, availableCopies: true, pricePaisa: true } },
        },
      });
      if (!existing) throw new ApiError("NOT_FOUND", "Issue not found", 404);
      if (existing.status !== "issued") {
        throw new ApiError("ALREADY_RESOLVED", `Issue already ${existing.status}`, 409);
      }

      const now = new Date();

      // Calculate fine for late returns
      const tenant = await tx.tenant.findFirst({
        where: { id: tenantId },
        select: { settings: true },
      });
      const settings = librarySettingsOf(tenant?.settings);
      const finePaisa =
        body.action === "return"
          ? calculateFine(existing.dueAt, now, settings.finePerDayPaisa)
          : existing.book.pricePaisa ?? 0; // lost = book price as fine

      const row = await tx.libraryIssue.update({
        where: { id: existing.id },
        data: {
          status: body.action === "return" ? "returned" : "lost",
          returnedAt: now,
          finePaisa,
          fineCollected: body.fineCollected ?? false,
          note: body.note ?? existing.note,
        },
        include: {
          book: { select: { publicId: true, title: true, accessionNo: true } },
          student: { select: { publicId: true, name: true } },
          staff: { select: { publicId: true, name: true } },
        },
      });

      // Restore available copy (only for returns, not lost)
      if (body.action === "return") {
        await tx.libraryBook.update({
          where: { id: existing.book.id },
          data: { availableCopies: { increment: 1 } },
        });
      }

      await audit(tx, {
        tenantId,
        action: body.action === "return" ? "return" : "mark_lost",
        entity: "library_issue",
        entityId: row.publicId,
        after: {
          bookTitle: existing.book.title,
          status: row.status,
          finePaisa,
          fineCollected: row.fineCollected,
        },
      });

      return row;
    });

    return ok(updated);
  },
);
