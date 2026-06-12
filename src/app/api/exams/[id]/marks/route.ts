import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";
import { computeSubjectGrade } from "@/lib/exams/grading";
import { bandsToInput } from "@/lib/exams/scales";
import { MARKS_ROLES } from "@/lib/exams/schemas";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/exams/[id]/marks?examSubject=uuid — class roster for an exam
 * subject with any entered marks and a live grade preview (current scale).
 */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantSession();
  const idResult = z.uuid().safeParse((await ctx.params).id);
  if (!idResult.success) throw new ApiError("NOT_FOUND", "Exam not found", 404);
  const esResult = z.uuid().safeParse(new URL(req.url).searchParams.get("examSubject"));
  if (!esResult.success) throw new ApiError("INVALID", "examSubject query param required", 422);

  const data = await withTenant(tenantId, async (tx) => {
    const es = await tx.examSubject.findFirst({
      where: {
        tenantId,
        publicId: esResult.data,
        deletedAt: null,
        exam: { publicId: idResult.data, deletedAt: null },
      },
      include: {
        exam: {
          select: {
            publicId: true,
            name: true,
            status: true,
            academicYearId: true,
            gradeScale: { select: { bands: { orderBy: { sortOrder: "asc" } } } },
          },
        },
        subject: { select: { publicId: true, name: true, nameNe: true } },
        class: { select: { publicId: true, name: true } },
      },
    });
    if (!es) throw new ApiError("NOT_FOUND", "Exam subject not found", 404);

    // Roster: students enrolled in this class for the exam's academic year.
    const enrollments = await tx.enrollment.findMany({
      where: {
        tenantId,
        academicYearId: es.exam.academicYearId,
        deletedAt: null,
        status: { in: ["enrolled", "promoted"] },
        section: { classId: es.classId },
      },
      orderBy: [{ rollNo: "asc" }, { id: "asc" }],
      include: {
        student: { select: { publicId: true, name: true, nameNe: true, admissionNo: true } },
        section: { select: { publicId: true, name: true } },
      },
    });

    const marks = await tx.mark.findMany({
      where: { tenantId, examSubjectId: es.id },
      select: {
        studentId: true,
        marksTh: true,
        marksPr: true,
        isAbsent: true,
        gradeLetter: true,
        gradePoint: true,
        percent: true,
      },
    });
    const studentRows = await tx.student.findMany({
      where: { tenantId, id: { in: marks.map((m) => m.studentId) } },
      select: { id: true, publicId: true },
    });
    const publicByDbId = new Map(studentRows.map((s) => [s.id.toString(), s.publicId]));
    const markByStudent = new Map(marks.map((m) => [publicByDbId.get(m.studentId.toString()), m]));

    const bands = bandsToInput(es.exam.gradeScale.bands);
    const isPublished = es.exam.status === "published";
    const roster = enrollments.map((e) => {
      const m = markByStudent.get(e.student.publicId);
      // Published exams show the snapshotted grade (immutable even if the
      // scale is edited later); drafts get a live preview from current bands.
      const preview =
        isPublished && m && m.gradeLetter !== null
          ? {
              obtained:
                Number(m.marksTh ?? 0) + (es.hasPractical ? Number(m.marksPr ?? 0) : 0),
              fullMarks: es.fullMarksTh + (es.hasPractical ? (es.fullMarksPr ?? 0) : 0),
              percent: Number(m.percent ?? 0),
              letter: m.gradeLetter,
              gradePoint: Number(m.gradePoint ?? 0),
              isNg: Number(m.gradePoint ?? 0) === 0,
            }
          : m && (m.marksTh !== null || m.isAbsent)
          ? computeSubjectGrade(
              {
                marksTh: m.marksTh === null ? null : Number(m.marksTh),
                marksPr: m.marksPr === null ? null : Number(m.marksPr),
                isAbsent: m.isAbsent,
                fullMarksTh: es.fullMarksTh,
                passMarksTh: es.passMarksTh,
                fullMarksPr: es.fullMarksPr,
                passMarksPr: es.passMarksPr,
                hasPractical: es.hasPractical,
              },
              bands,
            )
          : null;
      return {
        student: e.student,
        section: e.section,
        rollNo: e.rollNo,
        marksTh: m?.marksTh ?? null,
        marksPr: m?.marksPr ?? null,
        isAbsent: m?.isAbsent ?? false,
        preview,
      };
    });

    return {
      exam: { publicId: es.exam.publicId, name: es.exam.name, status: es.exam.status },
      examSubject: {
        publicId: es.publicId,
        subject: es.subject,
        class: es.class,
        hasPractical: es.hasPractical,
        fullMarksTh: es.fullMarksTh,
        passMarksTh: es.passMarksTh,
        fullMarksPr: es.fullMarksPr,
        passMarksPr: es.passMarksPr,
      },
      roster,
    };
  });

  return ok(data);
});

const MarkRowSchema = z.object({
  studentId: z.uuid(),
  marksTh: z.number().min(0).max(1000).nullable(),
  marksPr: z.number().min(0).max(1000).nullable(),
  isAbsent: z.boolean().default(false),
});

const SaveMarksSchema = z.object({
  examSubjectId: z.uuid(),
  marks: z.array(MarkRowSchema).min(1).max(500),
});

/** PUT /api/exams/[id]/marks — bulk upsert marks (rejected once published). */
export const PUT = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId, session } = await requireTenantWrite(MARKS_ROLES);
  const idResult = z.uuid().safeParse((await ctx.params).id);
  if (!idResult.success) throw new ApiError("NOT_FOUND", "Exam not found", 404);
  const body = await parseBody(req, SaveMarksSchema);

  const result = await withTenant(tenantId, async (tx) => {
    const es = await tx.examSubject.findFirst({
      where: {
        tenantId,
        publicId: body.examSubjectId,
        deletedAt: null,
        exam: { publicId: idResult.data, deletedAt: null },
      },
      include: { exam: { select: { id: true, status: true, publicId: true } } },
    });
    if (!es) throw new ApiError("NOT_FOUND", "Exam subject not found", 404);
    if (es.exam.status === "published")
      throw new ApiError(
        "LOCKED",
        "Results are published — marks are locked (an admin can unlock with a reason)",
        409,
      );

    // Validate ranges against this subject's configured full marks.
    for (const m of body.marks) {
      if (m.marksTh !== null && m.marksTh > es.fullMarksTh)
        throw new ApiError("INVALID", `Theory marks exceed full marks (${es.fullMarksTh})`, 422);
      if (m.marksPr !== null) {
        if (!es.hasPractical)
          throw new ApiError("INVALID", "This subject has no practical component", 422);
        if (es.fullMarksPr !== null && m.marksPr > es.fullMarksPr)
          throw new ApiError("INVALID", `Practical marks exceed full marks (${es.fullMarksPr})`, 422);
      }
    }

    const students = await tx.student.findMany({
      where: {
        tenantId,
        publicId: { in: body.marks.map((m) => m.studentId) },
        deletedAt: null,
      },
      select: { id: true, publicId: true },
    });
    const dbIdByPublic = new Map(students.map((s) => [s.publicId, s.id]));

    let saved = 0;
    for (const m of body.marks) {
      const studentId = dbIdByPublic.get(m.studentId);
      if (!studentId) throw new ApiError("NOT_FOUND", `Student ${m.studentId} not found`, 404);
      await tx.mark.upsert({
        where: { examSubjectId_studentId: { examSubjectId: es.id, studentId } },
        create: {
          tenantId,
          examId: es.exam.id,
          examSubjectId: es.id,
          studentId,
          marksTh: m.isAbsent ? null : m.marksTh,
          marksPr: m.isAbsent ? null : m.marksPr,
          isAbsent: m.isAbsent,
          enteredBy: session.sub,
        },
        update: {
          marksTh: m.isAbsent ? null : m.marksTh,
          marksPr: m.isAbsent ? null : m.marksPr,
          isAbsent: m.isAbsent,
          enteredBy: session.sub,
          // Any edit invalidates previously computed snapshots (draft only).
          percent: null,
          gradeLetter: null,
          gradePoint: null,
        },
      });
      saved++;
    }

    await audit(tx, {
      tenantId,
      action: "update",
      entity: "marks",
      entityId: es.publicId,
      after: { examSubject: es.publicId, rowsSaved: saved },
      reason: `Marks entry by ${session.sub}`,
    });

    return { saved };
  });

  return ok(result);
});
