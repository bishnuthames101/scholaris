import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

function parseId(id: string): string {
  const r = z.uuid().safeParse(id);
  if (!r.success) throw new ApiError("NOT_FOUND", "Route not found", 404);
  return r.data;
}

/** GET /api/transport/routes/[id] — route detail with stops + assigned students. */
export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantWrite(["school_admin", "principal", "transport"]);

    const route = await withTenant(tenantId, async (tx) => {
      const row = await tx.transportRoute.findFirst({
        where: { tenantId, publicId: id, deletedAt: null },
        include: {
          stops: {
            orderBy: { sortOrder: "asc" },
            select: {
              publicId: true,
              name: true,
              nameNe: true,
              sortOrder: true,
              pickupTime: true,
              dropTime: true,
            },
          },
          assignments: {
            where: { isActive: true },
            select: {
              publicId: true,
              monthlyFeePaisa: true,
              student: {
                select: {
                  publicId: true,
                  name: true,
                  nameNe: true,
                  enrollments: {
                    where: { deletedAt: null, academicYear: { isCurrent: true } },
                    take: 1,
                    select: {
                      section: {
                        select: {
                          publicId: true,
                          name: true,
                          class: { select: { publicId: true, name: true } },
                        },
                      },
                    },
                  },
                },
              },
              stop: {
                select: { publicId: true, name: true },
              },
            },
          },
        },
      });
      if (!row) throw new ApiError("NOT_FOUND", "Route not found", 404);
      return row;
    });

    return ok(route);
  },
);

const UpdateRouteSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nameNe: z.string().max(200).nullable().optional(),
  vehicleNo: z.string().max(20).nullable().optional(),
  driverName: z.string().max(200).nullable().optional(),
  driverPhone: z.string().regex(/^\+?[0-9\-]{7,20}$/).nullable().optional(),
  capacity: z.number().int().min(1).max(200).nullable().optional(),
  isActive: z.boolean().optional(),
});

/** PATCH /api/transport/routes/[id] — update a route. */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantWrite(["school_admin", "transport"]);
    const body = await parseBody(req, UpdateRouteSchema);

    const updated = await withTenant(tenantId, async (tx) => {
      const existing = await tx.transportRoute.findFirst({
        where: { tenantId, publicId: id, deletedAt: null },
      });
      if (!existing) throw new ApiError("NOT_FOUND", "Route not found", 404);

      if (body.name && body.name !== existing.name) {
        const dup = await tx.transportRoute.findFirst({
          where: { tenantId, name: body.name, deletedAt: null, NOT: { id: existing.id } },
          select: { id: true },
        });
        if (dup)
          throw new ApiError(
            "ROUTE_NAME_EXISTS",
            `A route named "${body.name}" already exists`,
            409,
          );
      }

      const row = await tx.transportRoute.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          nameNe: body.nameNe,
          vehicleNo: body.vehicleNo,
          driverName: body.driverName,
          driverPhone: body.driverPhone,
          capacity: body.capacity,
          isActive: body.isActive,
        },
      });

      await audit(tx, {
        tenantId,
        action: "update",
        entity: "transport_routes",
        entityId: row.publicId,
        before: {
          name: existing.name,
          vehicleNo: existing.vehicleNo,
          driverName: existing.driverName,
          capacity: existing.capacity,
          isActive: existing.isActive,
        },
        after: {
          name: row.name,
          vehicleNo: row.vehicleNo,
          driverName: row.driverName,
          capacity: row.capacity,
          isActive: row.isActive,
        },
      });

      return row;
    });

    return ok(updated);
  },
);

/** DELETE /api/transport/routes/[id] — soft-delete; only if no active assignments. */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantWrite(["school_admin", "transport"]);

    const deleted = await withTenant(tenantId, async (tx) => {
      const existing = await tx.transportRoute.findFirst({
        where: { tenantId, publicId: id, deletedAt: null },
      });
      if (!existing) throw new ApiError("NOT_FOUND", "Route not found", 404);

      const activeCount = await tx.transportAssignment.count({
        where: { tenantId, routeId: existing.id, isActive: true },
      });
      if (activeCount > 0)
        throw new ApiError(
          "ROUTE_HAS_ASSIGNMENTS",
          `Cannot delete route with ${activeCount} active assignment(s). Remove assignments first.`,
          409,
        );

      const row = await tx.transportRoute.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await audit(tx, {
        tenantId,
        action: "soft_delete",
        entity: "transport_routes",
        entityId: row.publicId,
        before: { name: existing.name, vehicleNo: existing.vehicleNo },
      });

      return row;
    });

    return ok({ publicId: deleted.publicId, deletedAt: deleted.deletedAt });
  },
);
