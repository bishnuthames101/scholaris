import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";
import { validateBands } from "@/lib/exams/grading";
import { BandSchema, EXAM_ADMIN_ROLES } from "@/lib/exams/schemas";

type Ctx = { params: Promise<{ id: string }> };

const UpdateScaleSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  isDefault: z.boolean().optional(),
  bands: z.array(BandSchema).min(2).max(20).optional(),
});

/**
 * PUT /api/exams/grade-scales/[id] — update a scale (name / default / bands).
 * Replacing bands reflows live grade previews for draft exams; published
 * exams keep their snapshotted grades (IRD-style immutability).
 */
export const PUT = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite(EXAM_ADMIN_ROLES);
  const idResult = z.uuid().safeParse((await ctx.params).id);
  if (!idResult.success) throw new ApiError("NOT_FOUND", "Grade scale not found", 404);
  const body = await parseBody(req, UpdateScaleSchema);

  if (body.bands) {
    const err = validateBands(body.bands);
    if (err) throw new ApiError("INVALID_BANDS", err, 422);
  }

  const result = await withTenant(tenantId, async (tx) => {
    const scale = await tx.gradeScale.findFirst({
      where: { tenantId, publicId: idResult.data, deletedAt: null },
      include: { bands: { orderBy: { sortOrder: "asc" } } },
    });
    if (!scale) throw new ApiError("NOT_FOUND", "Grade scale not found", 404);

    if (body.name && body.name !== scale.name) {
      const dup = await tx.gradeScale.findFirst({
        where: { tenantId, name: body.name, deletedAt: null, id: { not: scale.id } },
        select: { id: true },
      });
      if (dup) throw new ApiError("DUPLICATE", "A grade scale with this name already exists", 409);
    }

    if (body.isDefault === true) {
      await tx.gradeScale.updateMany({
        where: { tenantId, isDefault: true, id: { not: scale.id } },
        data: { isDefault: false },
      });
    }

    if (body.bands) {
      await tx.gradeBand.deleteMany({ where: { gradeScaleId: scale.id } });
      await tx.gradeBand.createMany({
        data: body.bands.map((b, i) => ({
          tenantId,
          gradeScaleId: scale.id,
          letter: b.letter,
          letterNe: b.letterNe ?? null,
          gradePoint: b.gradePoint,
          minPercent: b.minPercent,
          maxPercent: b.maxPercent,
          isPassing: b.isPassing,
          sortOrder: i,
        })),
      });
    }

    const row = await tx.gradeScale.update({
      where: { id: scale.id },
      data: {
        name: body.name ?? undefined,
        isDefault: body.isDefault ?? undefined,
      },
      include: { bands: { orderBy: { sortOrder: "asc" } } },
    });

    await audit(tx, {
      tenantId,
      action: "update",
      entity: "grade_scales",
      entityId: scale.publicId,
      before: { name: scale.name, isDefault: scale.isDefault, bands: scale.bands },
      after: { name: row.name, isDefault: row.isDefault, bands: row.bands },
    });

    return row;
  });

  return ok(result);
});

/** DELETE /api/exams/grade-scales/[id] — soft delete (blocked while in use). */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite(EXAM_ADMIN_ROLES);
  const idResult = z.uuid().safeParse((await ctx.params).id);
  if (!idResult.success) throw new ApiError("NOT_FOUND", "Grade scale not found", 404);

  const result = await withTenant(tenantId, async (tx) => {
    const scale = await tx.gradeScale.findFirst({
      where: { tenantId, publicId: idResult.data, deletedAt: null },
      include: { _count: { select: { exams: { where: { deletedAt: null } } } } },
    });
    if (!scale) throw new ApiError("NOT_FOUND", "Grade scale not found", 404);
    if (scale.isDefault)
      throw new ApiError("IS_DEFAULT", "Set another scale as default before deleting this one", 409);
    if (scale._count.exams > 0)
      throw new ApiError("IN_USE", "This scale is used by one or more exams", 409);

    const row = await tx.gradeScale.update({
      where: { id: scale.id },
      data: { deletedAt: new Date() },
      select: { publicId: true },
    });

    await audit(tx, {
      tenantId,
      action: "soft_delete",
      entity: "grade_scales",
      entityId: scale.publicId,
      before: { name: scale.name },
    });

    return row;
  });

  return ok(result);
});
