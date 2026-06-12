import { z } from "zod";
import { ApiError, handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";
import { kathmanduDateString, toDbDate } from "@/lib/attendance";
import { fiscalYearLabel } from "@/lib/dates/bs";
import { discountAmount } from "@/lib/fees/money";
import { formatInvoiceNo, nextSequences } from "@/lib/fees/numbering";

/**
 * Bulk invoice generation (§Phase 3) — one invoice per student for a BS
 * billing month, from the class fee structure minus per-student discounts.
 * Students who already hold a non-void invoice for the same period are
 * skipped, so re-running for stragglers is safe.
 *
 * Everything happens in ONE transaction with batched writes (pooler-friendly):
 * reserve N invoice numbers → createMany invoices → createMany items →
 * createMany ledger entries.
 */

const FEE_ROLES = ["school_admin", "principal", "accountant"];

const bodySchema = z.object({
  classId: z.uuid(),
  sectionId: z.uuid().optional(),
  studentId: z.uuid().optional(), // narrow to a single student (individual generation)
  bsYear: z.number().int().min(2070).max(2200),
  bsMonth: z.number().int().min(1).max(12),
  headIds: z.array(z.uuid()).nonempty().optional(), // default: all monthly heads
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const POST = handler(async (req: Request) => {
  const { tenantId, session } = await requireTenantWrite(FEE_ROLES);
  const body = bodySchema.parse(await req.json());

  const issueDateStr = body.issueDate ?? kathmanduDateString();
  const issueDate = toDbDate(issueDateStr);
  const dueDate = body.dueDate ? toDbDate(body.dueDate) : null;
  const fiscalYear = fiscalYearLabel(issueDate);

  const result = await withTenant(
    tenantId,
    async (tx) => {
      const year = await tx.academicYear.findFirst({
        where: { tenantId, isCurrent: true, deletedAt: null },
        select: { id: true },
      });
      if (!year) throw new ApiError("NO_CURRENT_YEAR", "No current academic year is set", 409);

      const klass = await tx.schoolClass.findFirst({
        where: { tenantId, publicId: body.classId, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!klass) throw new ApiError("NOT_FOUND", "Class not found", 404);

      // Fee structure for this class + year (optionally narrowed to chosen heads).
      const structures = await tx.feeStructure.findMany({
        where: {
          tenantId,
          academicYearId: year.id,
          classId: klass.id,
          deletedAt: null,
          ...(body.headIds
            ? { feeHead: { publicId: { in: body.headIds } } }
            : { frequency: "monthly" }),
        },
        include: { feeHead: { select: { id: true, name: true, nameNe: true } } },
      });
      if (structures.length === 0) {
        throw new ApiError(
          "NO_STRUCTURE",
          "No fee structure is defined for this class (for the selected heads)",
          409,
        );
      }

      // Students in scope.
      const enrollments = await tx.enrollment.findMany({
        where: {
          tenantId,
          academicYearId: year.id,
          deletedAt: null,
          section: { classId: klass.id, deletedAt: null },
          ...(body.sectionId ? { section: { publicId: body.sectionId, classId: klass.id } } : {}),
          student: {
            status: "active",
            deletedAt: null,
            ...(body.studentId ? { publicId: body.studentId } : {}),
          },
        },
        select: {
          studentId: true,
          student: { select: { publicId: true, name: true } },
        },
      });
      if (enrollments.length === 0)
        throw new ApiError("NO_STUDENTS", "No active students in the selected scope", 409);

      const studentIds = enrollments.map((e) => e.studentId);

      // Skip students already invoiced for this BS period (non-void).
      const existing = await tx.invoice.findMany({
        where: {
          tenantId,
          bsYear: body.bsYear,
          bsMonth: body.bsMonth,
          studentId: { in: studentIds },
          status: { not: "void" },
        },
        select: { studentId: true },
      });
      const skipIds = new Set(existing.map((i) => i.studentId));
      const targets = enrollments.filter((e) => !skipIds.has(e.studentId));
      if (targets.length === 0) {
        return { created: 0, skipped: enrollments.length, totalPaisa: 0, invoices: [] };
      }

      // Per-student discounts (head-specific or blanket).
      const discounts = await tx.studentDiscount.findMany({
        where: { tenantId, studentId: { in: targets.map((t) => t.studentId) }, deletedAt: null },
        select: { studentId: true, feeHeadId: true, type: true, value: true },
      });
      const discountsByStudent = new Map<bigint, typeof discounts>();
      for (const d of discounts) {
        const list = discountsByStudent.get(d.studentId) ?? [];
        list.push(d);
        discountsByStudent.set(d.studentId, list);
      }

      // Compute line items per student.
      const computed = targets.map((t) => {
        const ds = discountsByStudent.get(t.studentId) ?? [];
        const items = structures.map((s) => {
          const applicable = ds.filter(
            (d) => d.feeHeadId === null || d.feeHeadId === s.feeHead.id,
          );
          const disc = Math.min(
            s.amountPaisa,
            applicable.reduce(
              (sum, d) =>
                sum + discountAmount(s.amountPaisa, { type: d.type, value: d.value }),
              0,
            ),
          );
          return {
            feeHeadId: s.feeHead.id,
            label: s.feeHead.name,
            labelNe: s.feeHead.nameNe,
            amountPaisa: s.amountPaisa,
            discountPaisa: disc,
          };
        });
        const subtotal = items.reduce((sum, i) => sum + i.amountPaisa, 0);
        const discount = items.reduce((sum, i) => sum + i.discountPaisa, 0);
        return { ...t, items, subtotal, discount, total: subtotal - discount };
      });

      // Reserve sequential fiscal-year numbers, then batch-create everything.
      const seqs = await nextSequences(tx, tenantId, "invoice", fiscalYear, computed.length);

      const invoices = await tx.invoice.createManyAndReturn({
        data: computed.map((c, i) => ({
          tenantId,
          invoiceNo: formatInvoiceNo(fiscalYear, seqs[i]),
          fiscalYear,
          seq: seqs[i],
          studentId: c.studentId,
          academicYearId: year.id,
          bsYear: body.bsYear,
          bsMonth: body.bsMonth,
          issueDate,
          dueDate,
          subtotalPaisa: c.subtotal,
          discountPaisa: c.discount,
          totalPaisa: c.total,
          createdBy: session.sub,
        })),
        select: { id: true, publicId: true, invoiceNo: true, studentId: true, totalPaisa: true },
      });

      const invoiceByStudent = new Map(invoices.map((inv) => [inv.studentId, inv]));

      await tx.invoiceItem.createMany({
        data: computed.flatMap((c) =>
          c.items.map((item) => ({
            tenantId,
            invoiceId: invoiceByStudent.get(c.studentId)!.id,
            ...item,
          })),
        ),
      });

      await tx.ledgerEntry.createMany({
        data: invoices.map((inv) => ({
          tenantId,
          studentId: inv.studentId,
          invoiceId: inv.id,
          type: "invoice_issued" as const,
          debitPaisa: inv.totalPaisa,
          narration: `Invoice ${inv.invoiceNo} issued (BS ${body.bsYear}-${String(body.bsMonth).padStart(2, "0")})`,
          createdBy: session.sub,
        })),
      });

      const totalPaisa = invoices.reduce((sum, i) => sum + i.totalPaisa, 0);
      await audit(tx, {
        tenantId,
        action: "invoices_generated",
        entity: "invoices",
        entityId: null,
        after: {
          class: klass.name,
          bsYear: body.bsYear,
          bsMonth: body.bsMonth,
          fiscalYear,
          created: invoices.length,
          skipped: skipIds.size,
          totalPaisa,
        },
      });

      return {
        created: invoices.length,
        skipped: skipIds.size,
        totalPaisa,
        invoices: invoices.map((i) => ({ publicId: i.publicId, invoiceNo: i.invoiceNo })),
      };
    },
    { timeoutMs: 60_000 },
  );

  return ok(result);
});
