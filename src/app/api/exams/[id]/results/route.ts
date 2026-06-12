import { z } from "zod";
import { ApiError, handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireTenantSession } from "@/lib/tenant";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/exams/[id]/results — published results with per-subject snapshots
 * (optionally filtered by ?class=uuid). Source for the results view + ranks.
 */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantSession();
  const idResult = z.uuid().safeParse((await ctx.params).id);
  if (!idResult.success) throw new ApiError("NOT_FOUND", "Exam not found", 404);
  const classFilter = new URL(req.url).searchParams.get("class");

  const data = await withTenant(tenantId, async (tx) => {
    const exam = await tx.exam.findFirst({
      where: { tenantId, publicId: idResult.data, deletedAt: null },
      select: {
        id: true,
        publicId: true,
        name: true,
        nameNe: true,
        status: true,
        publishedAt: true,
        academicYearId: true,
        academicYear: { select: { publicId: true, name: true } },
      },
    });
    if (!exam) throw new ApiError("NOT_FOUND", "Exam not found", 404);

    const results = await tx.examResult.findMany({
      where: { tenantId, examId: exam.id },
      orderBy: [{ gpa: "desc" }],
      include: {
        student: { select: { publicId: true, name: true, nameNe: true, admissionNo: true } },
      },
    });

    // Class/section context from the exam-year enrollment.
    const enrollments = await tx.enrollment.findMany({
      where: {
        tenantId,
        academicYearId: exam.academicYearId,
        studentId: { in: results.map((r) => r.studentId) },
        deletedAt: null,
      },
      include: {
        section: {
          select: { publicId: true, name: true, class: { select: { publicId: true, name: true } } },
        },
      },
    });
    const enrollByStudent = new Map(enrollments.map((e) => [e.studentId.toString(), e]));

    const rows = results
      .map((r) => {
        const enroll = enrollByStudent.get(r.studentId.toString());
        return {
          publicId: r.publicId,
          student: r.student,
          class: enroll?.section.class ?? null,
          section: enroll ? { publicId: enroll.section.publicId, name: enroll.section.name } : null,
          rollNo: enroll?.rollNo ?? null,
          gpa: r.gpa,
          status: r.status,
          ngCount: r.ngCount,
          summary: r.summary,
        };
      })
      .filter((r) => !classFilter || r.class?.publicId === classFilter);

    return {
      exam: {
        publicId: exam.publicId,
        name: exam.name,
        nameNe: exam.nameNe,
        status: exam.status,
        publishedAt: exam.publishedAt,
        academicYear: exam.academicYear,
      },
      results: rows,
    };
  });

  return ok(data);
});
