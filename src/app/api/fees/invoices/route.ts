import { z } from "zod";
import { ApiError, handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { pagination, requireTenantSession, requireTenantWrite } from "@/lib/tenant";
import { kathmanduDateString, toDbDate } from "@/lib/attendance";
import { fiscalYearLabel } from "@/lib/dates/bs";
import { formatInvoiceNo, nextSequences } from "@/lib/fees/numbering";

const FEE_ROLES = ["school_admin", "principal", "accountant"];

/**
 * GET /api/fees/invoices — paginated list with filters.
 * ?status= &studentId= &bsYear= &bsMonth= &q= (invoice no / student name / admission no)
 */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);

  const status = url.searchParams.get("status");
  const studentId = url.searchParams.get("studentId");
  const bsYear = Number(url.searchParams.get("bsYear")) || undefined;
  const bsMonth = Number(url.searchParams.get("bsMonth")) || undefined;
  const q = url.searchParams.get("q")?.trim();

  const where = {
    tenantId,
    ...(status && ["issued", "partially_paid", "paid", "void"].includes(status)
      ? { status: status as "issued" | "partially_paid" | "paid" | "void" }
      : {}),
    ...(studentId ? { student: { publicId: studentId } } : {}),
    ...(bsYear ? { bsYear } : {}),
    ...(bsMonth ? { bsMonth } : {}),
    ...(q
      ? {
          OR: [
            { invoiceNo: { contains: q, mode: "insensitive" as const } },
            { student: { name: { contains: q, mode: "insensitive" as const } } },
            { student: { admissionNo: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await withTenant(tenantId, (tx) =>
    Promise.all([
      tx.invoice.count({ where }),
      tx.invoice.findMany({
        where,
        orderBy: { id: "desc" },
        skip,
        take: pageSize,
        select: {
          publicId: true,
          invoiceNo: true,
          fiscalYear: true,
          bsYear: true,
          bsMonth: true,
          issueDate: true,
          dueDate: true,
          subtotalPaisa: true,
          discountPaisa: true,
          finePaisa: true,
          totalPaisa: true,
          paidPaisa: true,
          status: true,
          printCount: true,
          createdAt: true,
          student: {
            select: { publicId: true, name: true, nameNe: true, admissionNo: true },
          },
        },
      }),
    ]),
  );

  return ok(rows, { page, pageSize, total });
});

/**
 * POST /api/fees/invoices — individual invoice with custom line items
 * (one-off charges, fines, admission fees…).
 */
const itemSchema = z.object({
  feeHeadId: z.uuid().optional(),
  kind: z.enum(["fee", "fine"]).default("fee"),
  label: z.string().min(1).max(120),
  labelNe: z.string().max(120).optional(),
  amountPaisa: z.number().int().min(0).max(1_000_000_000),
  discountPaisa: z.number().int().min(0).max(1_000_000_000).default(0),
});

const createSchema = z.object({
  studentId: z.uuid(),
  bsYear: z.number().int().min(2070).max(2200),
  bsMonth: z.number().int().min(1).max(12).nullable().optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(500).optional(),
  items: z.array(itemSchema).min(1).max(50),
});

export const POST = handler(async (req: Request) => {
  const { tenantId, session } = await requireTenantWrite(FEE_ROLES);
  const body = createSchema.parse(await req.json());

  for (const item of body.items) {
    if (item.discountPaisa > item.amountPaisa)
      throw new ApiError("BAD_DISCOUNT", `Discount exceeds amount on "${item.label}"`, 400);
  }

  const issueDateStr = body.issueDate ?? kathmanduDateString();
  const issueDate = toDbDate(issueDateStr);
  const fiscalYear = fiscalYearLabel(issueDate);

  const invoice = await withTenant(tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({
      where: { tenantId, isCurrent: true, deletedAt: null },
      select: { id: true },
    });
    if (!year) throw new ApiError("NO_CURRENT_YEAR", "No current academic year is set", 409);

    const student = await tx.student.findFirst({
      where: { tenantId, publicId: body.studentId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!student) throw new ApiError("NOT_FOUND", "Student not found", 404);

    // Resolve optional fee head references.
    const headIds = body.items.map((i) => i.feeHeadId).filter((v): v is string => Boolean(v));
    const heads = headIds.length
      ? await tx.feeHead.findMany({
          where: { tenantId, publicId: { in: headIds }, deletedAt: null },
          select: { id: true, publicId: true },
        })
      : [];
    const headByPublicId = new Map(heads.map((h) => [h.publicId, h.id]));

    const subtotal = body.items
      .filter((i) => i.kind === "fee")
      .reduce((sum, i) => sum + i.amountPaisa, 0);
    const fine = body.items
      .filter((i) => i.kind === "fine")
      .reduce((sum, i) => sum + i.amountPaisa, 0);
    const discount = body.items.reduce((sum, i) => sum + i.discountPaisa, 0);
    const total = subtotal + fine - discount;

    const [seq] = await nextSequences(tx, tenantId, "invoice", fiscalYear, 1);
    const invoiceNo = formatInvoiceNo(fiscalYear, seq);

    const row = await tx.invoice.create({
      data: {
        tenantId,
        invoiceNo,
        fiscalYear,
        seq,
        studentId: student.id,
        academicYearId: year.id,
        bsYear: body.bsYear,
        bsMonth: body.bsMonth ?? null,
        issueDate,
        dueDate: body.dueDate ? toDbDate(body.dueDate) : null,
        subtotalPaisa: subtotal,
        discountPaisa: discount,
        finePaisa: fine,
        totalPaisa: total,
        note: body.note,
        createdBy: session.sub,
        items: {
          create: body.items.map((i) => ({
            tenantId,
            feeHeadId: i.feeHeadId ? (headByPublicId.get(i.feeHeadId) ?? null) : null,
            kind: i.kind,
            label: i.label,
            labelNe: i.labelNe ?? null,
            amountPaisa: i.amountPaisa,
            discountPaisa: i.discountPaisa,
          })),
        },
      },
      include: { items: true, student: { select: { publicId: true, name: true } } },
    });

    await tx.ledgerEntry.create({
      data: {
        tenantId,
        studentId: student.id,
        invoiceId: row.id,
        type: "invoice_issued",
        debitPaisa: total,
        narration: `Invoice ${invoiceNo} issued`,
        createdBy: session.sub,
      },
    });

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "invoices",
      entityId: row.publicId,
      after: { invoiceNo, student: student.name, totalPaisa: total },
    });

    return row;
  });

  return ok(invoice, undefined, 201);
});
