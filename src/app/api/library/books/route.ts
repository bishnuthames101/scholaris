import { z } from "zod";
import { handler, ok, created, parseBody, ApiError } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite, pagination } from "@/lib/tenant";

const CreateBookSchema = z.object({
  accessionNo: z.string().min(1).max(50),
  isbn: z.string().max(20).optional(),
  title: z.string().min(1).max(300),
  titleNe: z.string().max(300).optional(),
  author: z.string().max(200).optional(),
  authorNe: z.string().max(200).optional(),
  publisher: z.string().max(200).optional(),
  category: z.string().max(50).optional(),
  language: z.string().max(10).default("en"),
  edition: z.string().max(50).optional(),
  pages: z.number().int().positive().optional(),
  pricePaisa: z.number().int().min(0).optional(),
  shelfLocation: z.string().max(50).optional(),
  copies: z.number().int().min(1).max(1000).default(1),
});

/** GET /api/library/books — paginated book list with search & category filter. */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);
  const search = url.searchParams.get("search")?.trim();
  const category = url.searchParams.get("category")?.trim();

  const result = await withTenant(tenantId, async (tx) => {
    const where: Record<string, unknown> = { tenantId, deletedAt: null };

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { author: { contains: search, mode: "insensitive" } },
        { isbn: { contains: search, mode: "insensitive" } },
        { accessionNo: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      tx.libraryBook.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          _count: { select: { issues: { where: { status: "issued" } } } },
        },
      }),
      tx.libraryBook.count({ where }),
    ]);

    return { items, total };
  });

  return ok(result.items, { page, pageSize, total: result.total });
});

/** POST /api/library/books — add a new book to the catalog. */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(["school_admin", "librarian"]);
  const body = await parseBody(req, CreateBookSchema);

  const book = await withTenant(tenantId, async (tx) => {
    // Check accessionNo uniqueness within tenant
    const existing = await tx.libraryBook.findFirst({
      where: { tenantId, accessionNo: body.accessionNo, deletedAt: null },
    });
    if (existing) {
      throw new ApiError("DUPLICATE", "A book with this accession number already exists", 409);
    }

    const row = await tx.libraryBook.create({
      data: {
        tenantId,
        accessionNo: body.accessionNo,
        isbn: body.isbn ?? null,
        title: body.title,
        titleNe: body.titleNe ?? null,
        author: body.author ?? null,
        authorNe: body.authorNe ?? null,
        publisher: body.publisher ?? null,
        category: body.category ?? null,
        language: body.language,
        edition: body.edition ?? null,
        pages: body.pages ?? null,
        pricePaisa: body.pricePaisa ?? null,
        shelfLocation: body.shelfLocation ?? null,
        copies: body.copies,
        availableCopies: body.copies,
      },
    });

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "library_book",
      entityId: row.publicId,
      after: { title: row.title, accessionNo: row.accessionNo, copies: row.copies },
    });

    return row;
  });

  return created(book);
});
