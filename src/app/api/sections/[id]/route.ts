import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

const UpdateSectionSchema = z.object({
  name: z.string().min(1).optional(),
  classTeacherId: z.uuid().nullable().optional(),
});

/** PATCH /api/sections/[id] — update a section. */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const { tenantId } = await requireTenantWrite();
    const body = await parseBody(req, UpdateSectionSchema);

    const updated = await withTenant(tenantId, async (tx) => {
      const existing = await tx.section.findUnique({ where: { publicId: id } });
      if (!existing || existing.deletedAt)
        throw new ApiError("NOT_FOUND", "Section not found", 404);

      let classTeacherId: bigint | null | undefined;
      if (body.classTeacherId === null) {
        classTeacherId = null;
      } else if (body.classTeacherId !== undefined) {
        const staff = await tx.staff.findUnique({
          where: { publicId: body.classTeacherId },
        });
        if (!staff || staff.deletedAt)
          throw new ApiError("NOT_FOUND", "Class teacher (staff) not found", 404);
        classTeacherId = staff.id;
      }

      if (body.name !== undefined && body.name !== existing.name) {
        const dup = await tx.section.findFirst({
          where: {
            tenantId,
            classId: existing.classId,
            name: body.name,
            id: { not: existing.id },
          },
        });
        if (dup)
          throw new ApiError(
            "SECTION_EXISTS",
            "A section with this name already exists in this class",
            409,
          );
      }

      const row = await tx.section.update({
        where: { id: existing.id },
        data: { name: body.name, classTeacherId },
      });

      await audit(tx, {
        tenantId,
        action: "update",
        entity: "sections",
        entityId: row.publicId,
        before: { name: existing.name },
        after: { name: row.name, classTeacher: body.classTeacherId ?? undefined },
      });

      return row;
    });

    return ok(updated);
  },
);

/** DELETE /api/sections/[id] — soft-delete a section. */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const { tenantId } = await requireTenantWrite();

    const deleted = await withTenant(tenantId, async (tx) => {
      const existing = await tx.section.findUnique({ where: { publicId: id } });
      if (!existing || existing.deletedAt)
        throw new ApiError("NOT_FOUND", "Section not found", 404);

      const enrollments = await tx.enrollment.count({
        where: { sectionId: existing.id, deletedAt: null },
      });
      if (enrollments > 0)
        throw new ApiError(
          "ENROLLMENTS_EXIST",
          "Cannot delete a section that has enrollments",
          409,
        );

      const row = await tx.section.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await audit(tx, {
        tenantId,
        action: "soft_delete",
        entity: "sections",
        entityId: row.publicId,
        before: { name: existing.name },
      });

      return row;
    });

    return ok({ publicId: deleted.publicId, deletedAt: deleted.deletedAt });
  },
);
