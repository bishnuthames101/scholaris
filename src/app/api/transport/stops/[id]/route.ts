import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

function parseId(id: string): string {
  const r = z.uuid().safeParse(id);
  if (!r.success) throw new ApiError("NOT_FOUND", "Stop not found", 404);
  return r.data;
}

const UpdateStopSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nameNe: z.string().max(200).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  pickupTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  dropTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

/** PATCH /api/transport/stops/[id] — edit a stop. */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantWrite(["school_admin", "transport"]);
    const body = await parseBody(req, UpdateStopSchema);

    const updated = await withTenant(tenantId, async (tx) => {
      const existing = await tx.transportStop.findFirst({
        where: { tenantId, publicId: id },
        include: { route: { select: { publicId: true, deletedAt: true } } },
      });
      if (!existing || existing.route.deletedAt)
        throw new ApiError("NOT_FOUND", "Stop not found", 404);

      if (body.name && body.name !== existing.name) {
        const dup = await tx.transportStop.findFirst({
          where: { tenantId, routeId: existing.routeId, name: body.name, NOT: { id: existing.id } },
          select: { id: true },
        });
        if (dup)
          throw new ApiError(
            "STOP_NAME_EXISTS",
            `A stop named "${body.name}" already exists on this route`,
            409,
          );
      }

      const row = await tx.transportStop.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          nameNe: body.nameNe,
          sortOrder: body.sortOrder,
          pickupTime: body.pickupTime,
          dropTime: body.dropTime,
        },
      });

      await audit(tx, {
        tenantId,
        action: "update",
        entity: "transport_stops",
        entityId: row.publicId,
        before: {
          name: existing.name,
          sortOrder: existing.sortOrder,
          pickupTime: existing.pickupTime,
          dropTime: existing.dropTime,
        },
        after: {
          name: row.name,
          sortOrder: row.sortOrder,
          pickupTime: row.pickupTime,
          dropTime: row.dropTime,
        },
      });

      return row;
    });

    return ok(updated);
  },
);

/** DELETE /api/transport/stops/[id] — remove stop; only if no assignments reference it. */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantWrite(["school_admin", "transport"]);

    await withTenant(tenantId, async (tx) => {
      const existing = await tx.transportStop.findFirst({
        where: { tenantId, publicId: id },
        include: { route: { select: { deletedAt: true } } },
      });
      if (!existing || existing.route.deletedAt)
        throw new ApiError("NOT_FOUND", "Stop not found", 404);

      const assignmentCount = await tx.transportAssignment.count({
        where: { tenantId, stopId: existing.id, isActive: true },
      });
      if (assignmentCount > 0)
        throw new ApiError(
          "STOP_HAS_ASSIGNMENTS",
          `Cannot delete stop with ${assignmentCount} active assignment(s). Remove assignments first.`,
          409,
        );

      await tx.transportStop.delete({ where: { id: existing.id } });

      await audit(tx, {
        tenantId,
        action: "delete",
        entity: "transport_stops",
        entityId: existing.publicId,
        before: { name: existing.name, sortOrder: existing.sortOrder },
      });
    });

    return ok({ publicId: id, deleted: true });
  },
);
