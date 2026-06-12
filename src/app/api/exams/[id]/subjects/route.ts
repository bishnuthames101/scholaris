import { z } from "zod";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";
import { EXAM_ADMIN_ROLES } from "@/lib/exams/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/exams/[id]/subjects — exam subjects grouped by class. */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantSession();
  const idResult = z.uuid().safeParse((await ctx.params).id);
  if (!idResult.success) throw new ApiError("NOT_FOUND", "Exam not found", 404);

  const rows = await withTenant(tenantId, async (tx) => {
    const exam = await tx.exam.findFirst({
      where: { tenantId, publicId: idResult.data, deletedAt: null },
      select: { id: true },
    });
    if (!exam) throw new ApiError("NOT_FOUND", "Exam not found", 404);

    return tx.examSubject.findMany({
      where: { tenantId, examId: exam.id, deletedAt: null },
      orderBy: [{ classId: "asc" }, { id: "asc" }],
      include: {
        class: { select: { publicId: true, name: true, nameNe: true, gradeLevel: true } },
        subject: { select: { publicId: true, name: true, nameNe: true, code: true } },
        _count: { select: { marks: true } },
      },
    });
  });

  return ok(rows);
});

const AddSubjectsSchema = z
  .object({
    // Either explicit subject ids, or a class id to add ALL its subjects.
    subjectIds: z.array(z.uuid()).min(1).max(100).optional(),
    classId: z.uuid().optional(),
    examDate: z.iso.date().optional(),
  })
  .refine((b) => b.subjectIds || b.classId, {
    message: "Provide subjectIds or classId",
  });

/**
 * POST /api/exams/[id]/subjects — add subjects to a draft exam, snapshotting
 * full/pass marks from the Subject config (idempotent — existing skipped).
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite(EXAM_ADMIN_ROLES);
  const idResult = z.uuid().safeParse((await ctx.params).id);
  if (!idResult.success) throw new ApiError("NOT_FOUND", "Exam not found", 404);
  const body = await parseBody(req, AddSubjectsSchema);

  const result = await withTenant(tenantId, async (tx) => {
    const exam = await tx.exam.findFirst({
      where: { tenantId, publicId: idResult.data, deletedAt: null },
      select: { id: true, publicId: true, status: true },
    });
    if (!exam) throw new ApiError("NOT_FOUND", "Exam not found", 404);
    if (exam.status === "published")
      throw new ApiError("LOCKED", "Published exams cannot be edited — unlock first", 409);

    const subjects = await tx.subject.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(body.subjectIds ? { publicId: { in: body.subjectIds } } : {}),
        ...(body.classId ? { class: { publicId: body.classId } } : {}),
      },
      select: {
        id: true,
        classId: true,
        hasPractical: true,
        fullMarksTh: true,
        passMarksTh: true,
        fullMarksPr: true,
        passMarksPr: true,
      },
    });
    if (subjects.length === 0) throw new ApiError("NOT_FOUND", "No matching subjects found", 404);

    const existing = await tx.examSubject.findMany({
      where: { examId: exam.id, subjectId: { in: subjects.map((s) => s.id) } },
      select: { id: true, subjectId: true, deletedAt: true },
    });
    const existingBySubject = new Map(existing.map((e) => [e.subjectId, e]));

    let added = 0;
    let restored = 0;
    for (const s of subjects) {
      const prev = existingBySubject.get(s.id);
      if (prev && !prev.deletedAt) continue; // already in the exam
      if (prev) {
        await tx.examSubject.update({
          where: { id: prev.id },
          data: { deletedAt: null, examDate: body.examDate ? new Date(body.examDate) : null },
        });
        restored++;
        continue;
      }
      await tx.examSubject.create({
        data: {
          tenantId,
          examId: exam.id,
          classId: s.classId,
          subjectId: s.id,
          hasPractical: s.hasPractical,
          fullMarksTh: s.fullMarksTh,
          passMarksTh: s.passMarksTh,
          fullMarksPr: s.hasPractical ? s.fullMarksPr : null,
          passMarksPr: s.hasPractical ? s.passMarksPr : null,
          examDate: body.examDate ? new Date(body.examDate) : null,
        },
      });
      added++;
    }

    await audit(tx, {
      tenantId,
      action: "update",
      entity: "exams",
      entityId: exam.publicId,
      after: { subjectsAdded: added, subjectsRestored: restored },
    });

    return { added, restored, skipped: subjects.length - added - restored };
  });

  return created(result);
});
