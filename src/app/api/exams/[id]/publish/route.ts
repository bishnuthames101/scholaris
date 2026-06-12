import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { ApiError, handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";
import { computeOverallResult, computeSubjectGrade, type SubjectGrade } from "@/lib/exams/grading";
import { bandsToInput } from "@/lib/exams/scales";
import { EXAM_ADMIN_ROLES } from "@/lib/exams/schemas";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/exams/[id]/publish — compute + snapshot grades for every entered
 * mark, build per-student results, lock marks, emit `results.published`.
 * Grade snapshots survive later grade-scale edits (immutability on publish).
 */
export const POST = handler(async (_req: Request, ctx: Ctx) => {
  const { tenantId, session } = await requireTenantWrite(EXAM_ADMIN_ROLES);
  const idResult = z.uuid().safeParse((await ctx.params).id);
  if (!idResult.success) throw new ApiError("NOT_FOUND", "Exam not found", 404);

  const result = await withTenant(
    tenantId,
    async (tx) => {
      const exam = await tx.exam.findFirst({
        where: { tenantId, publicId: idResult.data, deletedAt: null },
        include: {
          gradeScale: { select: { bands: { orderBy: { sortOrder: "asc" } } } },
          subjects: {
            where: { deletedAt: null },
            include: {
              subject: { select: { publicId: true, name: true, nameNe: true } },
              marks: true,
            },
          },
        },
      });
      if (!exam) throw new ApiError("NOT_FOUND", "Exam not found", 404);
      if (exam.status === "published")
        throw new ApiError("ALREADY_PUBLISHED", "This exam is already published", 409);

      const bands = bandsToInput(exam.gradeScale.bands);
      const totalMarks = exam.subjects.reduce((n, s) => n + s.marks.length, 0);
      if (totalMarks === 0)
        throw new ApiError("NO_MARKS", "No marks have been entered for this exam", 409);

      // Compute + snapshot every mark; collect per-student subject grades.
      type StudentAgg = { grades: SubjectGrade[]; subjects: Record<string, unknown>[] };
      const byStudent = new Map<string, StudentAgg>();

      for (const es of exam.subjects) {
        for (const mark of es.marks) {
          const grade = computeSubjectGrade(
            {
              marksTh: mark.marksTh === null ? null : Number(mark.marksTh),
              marksPr: mark.marksPr === null ? null : Number(mark.marksPr),
              isAbsent: mark.isAbsent,
              fullMarksTh: es.fullMarksTh,
              passMarksTh: es.passMarksTh,
              fullMarksPr: es.fullMarksPr,
              passMarksPr: es.passMarksPr,
              hasPractical: es.hasPractical,
            },
            bands,
          );

          await tx.mark.update({
            where: { id: mark.id },
            data: {
              percent: grade.percent,
              gradeLetter: grade.letter,
              gradePoint: grade.gradePoint,
            },
          });

          const key = mark.studentId.toString();
          const agg = byStudent.get(key) ?? { grades: [], subjects: [] };
          agg.grades.push(grade);
          agg.subjects.push({
            subject: es.subject.name,
            subjectNe: es.subject.nameNe,
            subjectId: es.subject.publicId,
            hasPractical: es.hasPractical,
            fullMarksTh: es.fullMarksTh,
            fullMarksPr: es.fullMarksPr,
            marksTh: mark.marksTh === null ? null : Number(mark.marksTh),
            marksPr: mark.marksPr === null ? null : Number(mark.marksPr),
            isAbsent: mark.isAbsent,
            obtained: grade.obtained,
            fullMarks: grade.fullMarks,
            percent: grade.percent,
            letter: grade.letter,
            gradePoint: grade.gradePoint,
            isNg: grade.isNg,
          });
          byStudent.set(key, agg);
        }
      }

      // Rebuild per-student results (republish after unlock replaces them).
      await tx.examResult.deleteMany({ where: { examId: exam.id } });
      let passed = 0;
      let failed = 0;
      for (const [studentKey, agg] of byStudent) {
        const overall = computeOverallResult(agg.grades);
        if (overall.status === "passed") passed++;
        else failed++;
        await tx.examResult.create({
          data: {
            tenantId,
            examId: exam.id,
            studentId: BigInt(studentKey),
            gpa: overall.gpa,
            status: overall.status,
            ngCount: overall.ngCount,
            summary: { subjects: agg.subjects } as Prisma.InputJsonValue,
          },
        });
      }

      const row = await tx.exam.update({
        where: { id: exam.id },
        data: { status: "published", publishedAt: new Date(), publishedBy: session.sub },
        select: { publicId: true, name: true, status: true, publishedAt: true },
      });

      await tx.domainEvent.create({
        data: {
          tenantId,
          type: "results.published",
          payload: {
            examId: row.publicId,
            examName: exam.name,
            students: byStudent.size,
            passed,
            failed,
          },
        },
      });

      await audit(tx, {
        tenantId,
        action: "update",
        entity: "exams",
        entityId: exam.publicId,
        after: { status: "published", students: byStudent.size, passed, failed },
        reason: `Published by ${session.sub}`,
      });

      return { ...row, students: byStudent.size, passed, failed };
    },
    { timeoutMs: 120_000 },
  );

  return ok(result);
});
