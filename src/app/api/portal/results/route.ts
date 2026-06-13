import { handler, ok, ApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { requireParent, requireStudent } from "@/lib/portal";
import { withTenant } from "@/lib/db";

/**
 * GET /api/portal/results?student=<publicId>
 * Parent: must own the child. Student: sees own results.
 * Only shows results from published exams.
 */
export const GET = handler(async (req: Request) => {
  const session = await requireRole("parent", "student");
  const url = new URL(req.url);

  let tenantId: bigint;
  let studentId: bigint;

  if (session.roles.includes("parent")) {
    const parent = await requireParent();
    tenantId = parent.tenantId;
    const studentPubId = url.searchParams.get("student");
    if (!studentPubId) throw new ApiError("MISSING_STUDENT", "student query param required", 400);

    const student = await withTenant(tenantId, (tx) =>
      tx.student.findFirst({
        where: { tenantId, publicId: studentPubId, deletedAt: null },
        select: { id: true, guardians: { where: { guardianId: parent.guardianId } } },
      }),
    );
    if (!student || student.guardians.length === 0)
      throw new ApiError("FORBIDDEN", "This student is not linked to your account", 403);
    studentId = student.id;
  } else {
    const stu = await requireStudent();
    tenantId = stu.tenantId;
    studentId = stu.studentId;
  }

  const results = await withTenant(tenantId, async (tx) => {
    // Only results from published exams
    const examResults = await tx.examResult.findMany({
      where: {
        studentId,
        tenantId,
        exam: { publishedAt: { not: null } },
      },
      orderBy: { computedAt: "desc" },
      include: {
        exam: {
          select: {
            publicId: true,
            name: true,
            publishedAt: true,
            academicYear: { select: { name: true } },
          },
        },
      },
    });

    // Enrich with subject-wise marks
    const enriched = await Promise.all(
      examResults.map(async (r) => {
        const marks = await tx.mark.findMany({
          where: { studentId, examId: r.examId },
          include: {
            examSubject: {
              include: { subject: { select: { name: true, nameNe: true } } },
            },
          },
        });
        return {
          publicId: r.publicId,
          examName: r.exam.name,
          examPublicId: r.exam.publicId,
          academicYear: r.exam.academicYear.name,
          gpa: Number(r.gpa),
          status: r.status,
          ngCount: r.ngCount,
          summary: r.summary,
          computedAt: r.computedAt,
          subjects: marks.map((m) => ({
            name: m.examSubject.subject.name,
            nameNe: m.examSubject.subject.nameNe,
            marksTh: m.marksTh ? Number(m.marksTh) : null,
            marksPr: m.marksPr ? Number(m.marksPr) : null,
            fullMarksTh: m.examSubject.fullMarksTh,
            fullMarksPr: m.examSubject.fullMarksPr,
            passMarksTh: m.examSubject.passMarksTh,
            passMarksPr: m.examSubject.passMarksPr,
            percent: m.percent ? Number(m.percent) : null,
            gradeLetter: m.gradeLetter,
            gradePoint: m.gradePoint ? Number(m.gradePoint) : null,
            isAbsent: m.isAbsent,
          })),
        };
      }),
    );

    return enriched;
  });

  return ok(results);
});
