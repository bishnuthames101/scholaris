import { handler, ok } from "@/lib/api";
import { requireParent } from "@/lib/portal";
import { withTenant } from "@/lib/db";

/**
 * GET /api/portal/children — list the parent's children with current enrollment,
 * latest attendance, and fee summary.
 */
export const GET = handler(async () => {
  const { tenantId, guardianId } = await requireParent();

  const children = await withTenant(tenantId, async (tx) => {
    const links = await tx.studentGuardian.findMany({
      where: { guardianId },
      include: {
        student: {
          select: {
            id: true,
            publicId: true,
            name: true,
            nameNe: true,
            admissionNo: true,
            photoUrl: true,
            status: true,
            enrollments: {
              where: { academicYear: { isCurrent: true }, deletedAt: null },
              select: {
                section: {
                  select: {
                    name: true,
                    class: { select: { name: true, gradeLevel: true } },
                  },
                },
              },
              take: 1,
            },
          },
        },
      },
    });

    const result = await Promise.all(
      links.map(async (link) => {
        const s = link.student;
        const enrollment = s.enrollments[0];

        // Attendance summary
        const [totalDays, absentDays] = await Promise.all([
          tx.attendanceRecord.count({ where: { studentId: s.id, tenantId } }),
          tx.attendanceRecord.count({ where: { studentId: s.id, tenantId, status: "absent" } }),
        ]);

        // Fee summary (amounts in paisa)
        const invoices = await tx.invoice.findMany({
          where: { studentId: s.id, tenantId, status: { not: "void" } },
          select: { totalPaisa: true, paidPaisa: true },
        });
        const totalDue = invoices.reduce((sum, i) => sum + i.totalPaisa, 0);
        const totalPaid = invoices.reduce((sum, i) => sum + i.paidPaisa, 0);

        return {
          publicId: s.publicId,
          name: s.name,
          nameNe: s.nameNe,
          admissionNo: s.admissionNo,
          photoUrl: s.photoUrl,
          status: s.status,
          relation: link.relation,
          isPrimary: link.isPrimary,
          class: enrollment
            ? `${enrollment.section.class.name} ${enrollment.section.name}`
            : null,
          gradeLevel: enrollment?.section.class.gradeLevel ?? null,
          attendance: { totalDays, absentDays, presentDays: totalDays - absentDays },
          fees: { totalDuePaisa: totalDue, totalPaidPaisa: totalPaid, balancePaisa: totalDue - totalPaid },
        };
      }),
    );

    return result;
  });

  return ok(children);
});
