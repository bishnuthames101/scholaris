import { z } from "zod";
import { handler, ok, created, parseBody, ApiError } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite, pagination } from "@/lib/tenant";
import { librarySettingsOf } from "@/lib/library/settings";

const CreateIssueSchema = z.object({
  bookId: z.string().uuid(),
  borrowerType: z.enum(["student", "staff"]),
  borrowerId: z.string().uuid(),
  dueAt: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
});

/** GET /api/library/issues — paginated active issues with filters. */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);
  const status = url.searchParams.get("status")?.trim();
  const overdue = url.searchParams.get("overdue");
  const studentId = url.searchParams.get("studentId")?.trim();
  const staffId = url.searchParams.get("staffId")?.trim();

  const result = await withTenant(tenantId, async (tx) => {
    const where: Record<string, unknown> = { tenantId };

    if (status && ["issued", "returned", "lost"].includes(status)) {
      where.status = status;
    }

    if (overdue === "true") {
      where.status = "issued";
      where.dueAt = { lt: new Date() };
    }

    if (studentId) {
      const r = z.uuid().safeParse(studentId);
      if (r.success) {
        const stu = await tx.student.findFirst({
          where: { tenantId, publicId: r.data, deletedAt: null },
          select: { id: true },
        });
        if (stu) where.studentId = stu.id;
      }
    }

    if (staffId) {
      const r = z.uuid().safeParse(staffId);
      if (r.success) {
        const stf = await tx.staff.findFirst({
          where: { tenantId, publicId: r.data, deletedAt: null },
          select: { id: true },
        });
        if (stf) where.staffId = stf.id;
      }
    }

    const [items, total] = await Promise.all([
      tx.libraryIssue.findMany({
        where,
        orderBy: { issuedAt: "desc" },
        skip,
        take: pageSize,
        include: {
          book: { select: { publicId: true, title: true, accessionNo: true } },
          student: { select: { publicId: true, name: true, nameNe: true } },
          staff: { select: { publicId: true, name: true, nameNe: true } },
        },
      }),
      tx.libraryIssue.count({ where }),
    ]);

    return { items, total };
  });

  return ok(result.items, { page, pageSize, total: result.total });
});

/** POST /api/library/issues — issue a book to a student or staff member. */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(["school_admin", "librarian"]);
  const body = await parseBody(req, CreateIssueSchema);

  const issue = await withTenant(tenantId, async (tx) => {
    // 1. Validate book exists and has available copies
    const book = await tx.libraryBook.findFirst({
      where: { tenantId, publicId: body.bookId, deletedAt: null },
    });
    if (!book) throw new ApiError("NOT_FOUND", "Book not found", 404);
    if (book.availableCopies < 1) {
      throw new ApiError("NO_COPIES", "No available copies of this book", 409);
    }

    // 2. Validate borrower exists
    let studentId: bigint | null = null;
    let staffId: bigint | null = null;
    let borrowerName: string;

    if (body.borrowerType === "student") {
      const student = await tx.student.findFirst({
        where: { tenantId, publicId: body.borrowerId, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!student) throw new ApiError("NOT_FOUND", "Student not found", 404);
      studentId = student.id;
      borrowerName = student.name;
    } else {
      const staff = await tx.staff.findFirst({
        where: { tenantId, publicId: body.borrowerId, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!staff) throw new ApiError("NOT_FOUND", "Staff member not found", 404);
      staffId = staff.id;
      borrowerName = staff.name;
    }

    // 3. Check max books limit from tenant settings
    const tenant = await tx.tenant.findFirst({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = librarySettingsOf(tenant?.settings);
    const maxBooks =
      body.borrowerType === "student"
        ? settings.maxBooksStudent
        : settings.maxBooksStaff;

    const activeCount = await tx.libraryIssue.count({
      where: {
        tenantId,
        status: "issued",
        ...(body.borrowerType === "student"
          ? { studentId }
          : { staffId }),
      },
    });
    if (activeCount >= maxBooks) {
      throw new ApiError(
        "MAX_BOOKS_REACHED",
        `Borrower already has ${activeCount} book(s) issued (limit: ${maxBooks})`,
        409,
      );
    }

    // 4. Calculate due date
    const dueAt = body.dueAt
      ? new Date(body.dueAt)
      : new Date(Date.now() + settings.maxIssueDays * 24 * 60 * 60 * 1000);

    // 5. Create the issue record
    const row = await tx.libraryIssue.create({
      data: {
        tenantId,
        bookId: book.id,
        borrowerType: body.borrowerType,
        studentId,
        staffId,
        dueAt,
        note: body.note ?? null,
      },
      include: {
        book: { select: { publicId: true, title: true, accessionNo: true } },
        student: { select: { publicId: true, name: true } },
        staff: { select: { publicId: true, name: true } },
      },
    });

    // 6. Atomically decrement available copies — verify still > 0
    const updated = await tx.libraryBook.updateMany({
      where: { id: book.id, availableCopies: { gt: 0 } },
      data: { availableCopies: { decrement: 1 } },
    });
    if (updated.count === 0) {
      throw new ApiError("NO_COPIES", "No available copies (concurrent checkout)", 409);
    }

    // 7. Audit
    await audit(tx, {
      tenantId,
      action: "create",
      entity: "library_issue",
      entityId: row.publicId,
      after: {
        bookTitle: book.title,
        accessionNo: book.accessionNo,
        borrowerType: body.borrowerType,
        borrowerName,
        dueAt: dueAt.toISOString(),
      },
    });

    return row;
  });

  return created(issue);
});
