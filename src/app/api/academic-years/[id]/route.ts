import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

const UpdateAcademicYearSchema = z.object({
  name: z.string().min(1).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  makeCurrent: z.boolean().optional(),
});

/** PATCH /api/academic-years/[id] — update an academic year. */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const { tenantId } = await requireTenantWrite();
    const body = await parseBody(req, UpdateAcademicYearSchema);

    const updated = await withTenant(tenantId, async (tx) => {
      const existing = await tx.academicYear.findUnique({ where: { publicId: id } });
      if (!existing || existing.deletedAt)
        throw new ApiError("NOT_FOUND", "Academic year not found", 404);

      if (body.makeCurrent) {
        await tx.academicYear.updateMany({
          where: { tenantId, isCurrent: true, id: { not: existing.id } },
          data: { isCurrent: false },
        });
      }

      const row = await tx.academicYear.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          startsAt: body.startsAt,
          endsAt: body.endsAt,
          isCurrent: body.makeCurrent === undefined ? undefined : body.makeCurrent,
        },
      });

      await audit(tx, {
        tenantId,
        action: "update",
        entity: "academic_years",
        entityId: row.publicId,
        before: {
          name: existing.name,
          startsAt: existing.startsAt,
          endsAt: existing.endsAt,
          isCurrent: existing.isCurrent,
        },
        after: {
          name: row.name,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          isCurrent: row.isCurrent,
        },
      });

      return row;
    });

    return ok(updated);
  },
);

/** DELETE /api/academic-years/[id] — soft-delete an academic year. */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const { tenantId } = await requireTenantWrite();

    const deleted = await withTenant(tenantId, async (tx) => {
      const existing = await tx.academicYear.findUnique({ where: { publicId: id } });
      if (!existing || existing.deletedAt)
        throw new ApiError("NOT_FOUND", "Academic year not found", 404);

      const enrollments = await tx.enrollment.count({
        where: { academicYearId: existing.id, deletedAt: null },
      });
      if (enrollments > 0)
        throw new ApiError(
          "ENROLLMENTS_EXIST",
          "Cannot delete an academic year that has enrollments",
          409,
        );

      const row = await tx.academicYear.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), isCurrent: false },
      });

      await audit(tx, {
        tenantId,
        action: "soft_delete",
        entity: "academic_years",
        entityId: row.publicId,
        before: { name: existing.name, isCurrent: existing.isCurrent },
      });

      return row;
    });

    return ok({ publicId: deleted.publicId, deletedAt: deleted.deletedAt });
  },
);
