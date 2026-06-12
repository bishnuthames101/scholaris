import { z } from "zod";
import { ApiError, handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireTenantSession } from "@/lib/tenant";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/fees/students/[id]/statement — full fee statement from the
 * immutable ledger, with a running balance (debit = charge, credit = payment
 * or reversal). Positive closing balance = amount the family still owes.
 */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantSession();
  const idResult = z.uuid().safeParse((await ctx.params).id);
  if (!idResult.success) throw new ApiError("NOT_FOUND", "Student not found", 404);

  const data = await withTenant(tenantId, async (tx) => {
    const student = await tx.student.findFirst({
      where: { tenantId, publicId: idResult.data, deletedAt: null },
      select: {
        id: true,
        publicId: true,
        name: true,
        nameNe: true,
        admissionNo: true,
        enrollments: {
          where: { deletedAt: null, academicYear: { isCurrent: true } },
          select: {
            rollNo: true,
            section: { select: { name: true, class: { select: { name: true } } } },
          },
          take: 1,
        },
      },
    });
    if (!student) throw new ApiError("NOT_FOUND", "Student not found", 404);

    const entries = await tx.ledgerEntry.findMany({
      where: { tenantId, studentId: student.id },
      orderBy: { id: "asc" },
      select: {
        publicId: true,
        type: true,
        debitPaisa: true,
        creditPaisa: true,
        narration: true,
        createdAt: true,
      },
    });

    let balance = 0;
    const lines = entries.map((e) => {
      balance += e.debitPaisa - e.creditPaisa;
      return { ...e, balancePaisa: balance };
    });

    const totals = entries.reduce(
      (acc, e) => ({
        debitPaisa: acc.debitPaisa + e.debitPaisa,
        creditPaisa: acc.creditPaisa + e.creditPaisa,
      }),
      { debitPaisa: 0, creditPaisa: 0 },
    );

    const enrollment = student.enrollments[0];
    return {
      student: {
        publicId: student.publicId,
        name: student.name,
        nameNe: student.nameNe,
        admissionNo: student.admissionNo,
        className: enrollment?.section.class.name ?? null,
        sectionName: enrollment?.section.name ?? null,
        rollNo: enrollment?.rollNo ?? null,
      },
      entries: lines,
      totals: { ...totals, balancePaisa: balance },
    };
  });

  return ok(data);
});
