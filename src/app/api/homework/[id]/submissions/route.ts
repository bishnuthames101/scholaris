import { z } from "zod";
import { ApiError, handler, ok, created, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

const submitSchema = z.object({
  studentId: z.string().uuid(),
  content: z.string().max(5000).optional(),
});

const gradeSchema = z.object({
  submissionId: z.string().uuid(),
  grade: z.string().max(20).optional(),
  comment: z.string().max(2000).optional(),
});

/** GET — all submissions for a homework item. */
export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { tenantId } = await requireTenantSession();
  const { id } = await params;

  const submissions = await withTenant(tenantId, async (tx) => {
    const hw = await tx.homework.findFirst({ where: { tenantId, publicId: id, deletedAt: null }, select: { id: true } });
    if (!hw) throw new ApiError("NOT_FOUND", "Homework not found", 404);

    return tx.homeworkSubmission.findMany({
      where: { tenantId, homeworkId: hw.id },
      include: {
        student: { select: { publicId: true, name: true, nameNe: true, admissionNo: true } },
      },
      orderBy: { submittedAt: "desc" },
    });
  });

  return ok(submissions);
});

/** POST — student submits homework. */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { tenantId } = await requireTenantSession();
  const { id } = await params;
  const body = await parseBody(req, submitSchema);

  const submission = await withTenant(tenantId, async (tx) => {
    const hw = await tx.homework.findFirst({
      where: { tenantId, publicId: id, deletedAt: null, publishedAt: { not: null } },
      select: { id: true },
    });
    if (!hw) throw new ApiError("NOT_FOUND", "Homework not found or not published", 404);

    const student = await tx.student.findFirst({
      where: { tenantId, publicId: body.studentId, deletedAt: null },
      select: { id: true },
    });
    if (!student) throw new ApiError("STUDENT_NOT_FOUND", "Student not found", 404);

    return tx.homeworkSubmission.upsert({
      where: { homeworkId_studentId: { homeworkId: hw.id, studentId: student.id } },
      update: { content: body.content ?? null, submittedAt: new Date() },
      create: {
        tenantId,
        homeworkId: hw.id,
        studentId: student.id,
        content: body.content ?? null,
      },
      include: {
        student: { select: { publicId: true, name: true } },
      },
    });
  });

  return created(submission);
});

/** PATCH — teacher grades a submission. */
export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { tenantId } = await requireTenantWrite(["school_admin", "principal", "teacher", "class_teacher"]);
  const { id: _hwId } = await params;
  const body = await parseBody(req, gradeSchema);

  const result = await withTenant(tenantId, async (tx) => {
    const sub = await tx.homeworkSubmission.findFirst({
      where: { tenantId, publicId: body.submissionId },
      select: { id: true },
    });
    if (!sub) throw new ApiError("SUBMISSION_NOT_FOUND", "Submission not found", 404);

    return tx.homeworkSubmission.update({
      where: { id: sub.id },
      data: {
        grade: body.grade ?? null,
        comment: body.comment ?? null,
        commentedAt: new Date(),
      },
      include: {
        student: { select: { publicId: true, name: true } },
      },
    });
  });

  return ok(result);
});
