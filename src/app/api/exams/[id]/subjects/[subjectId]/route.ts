import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";
import { EXAM_ADMIN_ROLES } from "@/lib/exams/schemas";

type Ctx = { params: Promise<{ id: string; subjectId: string }> };

async function loadIds(ctx: Ctx) {
  const p = await ctx.params;
  const exam = z.uuid().safeParse(p.id);
  const es = z.uuid().safeParse(p.subjectId);
  if (!exam.success || !es.success)
    throw new ApiError("NOT_FOUND", "Exam subject not found", 404);
  return { examPublicId: exam.data, examSubjectPublicId: es.data };
}

const UpdateSchema = z
  .object({
    fullMarksTh: z.number().int().min(1).max(1000).optional(),
    passMarksTh: z.number().int().min(0).max(1000).optional(),
    fullMarksPr: z.number().int().min(1).max(1000).nullable().optional(),
    passMarksPr: z.number().int().min(0).max(1000).nullable().optional(),
    hasPractical: z.boolean().optional(),
    examDate: z.iso.date().nullable().optional(),
  })
  .refine(
    (b) => b.passMarksTh === undefined || b.fullMarksTh === undefined || b.passMarksTh <= b.fullMarksTh,
    { message: "Theory pass marks cannot exceed full marks" },
  );

/** PATCH /api/exams/[id]/subjects/[subjectId] — adjust marks config (draft only). */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite(EXAM_ADMIN_ROLES);
  const { examPublicId, examSubjectPublicId } = await loadIds(ctx);
  const body = await parseBody(req, UpdateSchema);

  const result = await withTenant(tenantId, async (tx) => {
    const es = await tx.examSubject.findFirst({
      where: {
        tenantId,
        publicId: examSubjectPublicId,
        deletedAt: null,
        exam: { publicId: examPublicId, deletedAt: null },
      },
      include: { exam: { select: { status: true } } },
    });
    if (!es) throw new ApiError("NOT_FOUND", "Exam subject not found", 404);
    if (es.exam.status === "published")
      throw new ApiError("LOCKED", "Published exams cannot be edited — unlock first", 409);

    const hasPractical = body.hasPractical ?? es.hasPractical;
    const fullPr = body.fullMarksPr === undefined ? es.fullMarksPr : body.fullMarksPr;
    const passPr = body.passMarksPr === undefined ? es.passMarksPr : body.passMarksPr;
    if (hasPractical && (fullPr === null || fullPr === undefined))
      throw new ApiError("INVALID", "Practical full marks required when practical is enabled", 422);
    if (hasPractical && passPr !== null && passPr !== undefined && fullPr !== null && passPr > fullPr!)
      throw new ApiError("INVALID", "Practical pass marks cannot exceed full marks", 422);

    const row = await tx.examSubject.update({
      where: { id: es.id },
      data: {
        fullMarksTh: body.fullMarksTh ?? undefined,
        passMarksTh: body.passMarksTh ?? undefined,
        hasPractical: body.hasPractical ?? undefined,
        fullMarksPr: hasPractical ? fullPr : null,
        passMarksPr: hasPractical ? passPr : null,
        examDate:
          body.examDate === undefined ? undefined : body.examDate ? new Date(body.examDate) : null,
      },
    });

    await audit(tx, {
      tenantId,
      action: "update",
      entity: "exam_subjects",
      entityId: es.publicId,
      before: {
        fullMarksTh: es.fullMarksTh,
        passMarksTh: es.passMarksTh,
        fullMarksPr: es.fullMarksPr,
        passMarksPr: es.passMarksPr,
        hasPractical: es.hasPractical,
      },
      after: {
        fullMarksTh: row.fullMarksTh,
        passMarksTh: row.passMarksTh,
        fullMarksPr: row.fullMarksPr,
        passMarksPr: row.passMarksPr,
        hasPractical: row.hasPractical,
      },
    });

    return row;
  });

  return ok(result);
});

/** DELETE /api/exams/[id]/subjects/[subjectId] — remove from exam (draft, no marks). */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite(EXAM_ADMIN_ROLES);
  const { examPublicId, examSubjectPublicId } = await loadIds(ctx);

  const result = await withTenant(tenantId, async (tx) => {
    const es = await tx.examSubject.findFirst({
      where: {
        tenantId,
        publicId: examSubjectPublicId,
        deletedAt: null,
        exam: { publicId: examPublicId, deletedAt: null },
      },
      include: { exam: { select: { status: true } }, _count: { select: { marks: true } } },
    });
    if (!es) throw new ApiError("NOT_FOUND", "Exam subject not found", 404);
    if (es.exam.status === "published")
      throw new ApiError("LOCKED", "Published exams cannot be edited — unlock first", 409);
    if (es._count.marks > 0)
      throw new ApiError("HAS_MARKS", "Marks have been entered for this subject", 409);

    const row = await tx.examSubject.update({
      where: { id: es.id },
      data: { deletedAt: new Date() },
      select: { publicId: true },
    });

    await audit(tx, {
      tenantId,
      action: "soft_delete",
      entity: "exam_subjects",
      entityId: es.publicId,
    });

    return row;
  });

  return ok(result);
});
