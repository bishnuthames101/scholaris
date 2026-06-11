import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

const StreamEnum = z.enum(["science", "management", "humanities", "education"]);

const UpdateClassSchema = z.object({
  gradeLevel: z.number().int().min(-1).max(12).optional(),
  stream: StreamEnum.nullable().optional(),
  name: z.string().min(1).optional(),
  nameNe: z.string().nullable().optional(),
});

/** PATCH /api/classes/[id] — update a class. */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const { tenantId } = await requireTenantWrite();
    const body = await parseBody(req, UpdateClassSchema);

    const updated = await withTenant(tenantId, async (tx) => {
      const existing = await tx.schoolClass.findUnique({ where: { publicId: id } });
      if (!existing || existing.deletedAt)
        throw new ApiError("NOT_FOUND", "Class not found", 404);

      const effectiveGrade = body.gradeLevel ?? existing.gradeLevel;
      const effectiveStream =
        body.stream === undefined ? existing.stream : body.stream;
      if (effectiveStream && effectiveGrade !== 11 && effectiveGrade !== 12)
        throw new ApiError(
          "VALIDATION_ERROR",
          "Stream is only allowed for grades 11 and 12",
          422,
        );

      if (body.gradeLevel !== undefined || body.stream !== undefined) {
        const dup = await tx.schoolClass.findFirst({
          where: {
            tenantId,
            gradeLevel: effectiveGrade,
            stream: effectiveStream,
            id: { not: existing.id },
          },
        });
        if (dup)
          throw new ApiError(
            "CLASS_EXISTS",
            "A class with this grade level and stream already exists",
            409,
          );
      }

      const row = await tx.schoolClass.update({
        where: { id: existing.id },
        data: {
          gradeLevel: body.gradeLevel,
          stream: body.stream,
          name: body.name,
          nameNe: body.nameNe,
        },
      });

      await audit(tx, {
        tenantId,
        action: "update",
        entity: "classes",
        entityId: row.publicId,
        before: {
          gradeLevel: existing.gradeLevel,
          stream: existing.stream,
          name: existing.name,
          nameNe: existing.nameNe,
        },
        after: {
          gradeLevel: row.gradeLevel,
          stream: row.stream,
          name: row.name,
          nameNe: row.nameNe,
        },
      });

      return row;
    });

    return ok(updated);
  },
);

/** DELETE /api/classes/[id] — soft-delete a class. */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const { tenantId } = await requireTenantWrite();

    const deleted = await withTenant(tenantId, async (tx) => {
      const existing = await tx.schoolClass.findUnique({ where: { publicId: id } });
      if (!existing || existing.deletedAt)
        throw new ApiError("NOT_FOUND", "Class not found", 404);

      const sections = await tx.section.count({
        where: { classId: existing.id, deletedAt: null },
      });
      if (sections > 0)
        throw new ApiError("SECTIONS_EXIST", "Cannot delete a class that has sections", 409);

      const row = await tx.schoolClass.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await audit(tx, {
        tenantId,
        action: "soft_delete",
        entity: "classes",
        entityId: row.publicId,
        before: { gradeLevel: existing.gradeLevel, stream: existing.stream, name: existing.name },
      });

      return row;
    });

    return ok({ publicId: deleted.publicId, deletedAt: deleted.deletedAt });
  },
);
