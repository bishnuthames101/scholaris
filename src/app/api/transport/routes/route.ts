import { z } from "zod";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

const CreateRouteSchema = z.object({
  name: z.string().min(1).max(200),
  nameNe: z.string().max(200).optional(),
  vehicleNo: z.string().max(20).optional(),
  driverName: z.string().max(200).optional(),
  driverPhone: z.string().regex(/^\+?[0-9\-]{7,20}$/).optional(),
  capacity: z.number().int().min(1).max(200).optional(),
});

/** GET /api/transport/routes — list all routes with stops count and assignment count. */
export const GET = handler(async (_req: Request) => {
  const { tenantId } = await requireTenantWrite(["school_admin", "principal", "transport"]);

  const routes = await withTenant(tenantId, async (tx) => {
    return tx.transportRoute.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            stops: true,
            assignments: { where: { isActive: true } },
          },
        },
      },
    });
  });

  return ok(routes);
});

/** POST /api/transport/routes — create a transport route. */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(["school_admin", "transport"]);
  const body = await parseBody(req, CreateRouteSchema);

  const route = await withTenant(tenantId, async (tx) => {
    const dup = await tx.transportRoute.findFirst({
      where: { tenantId, name: body.name, deletedAt: null },
      select: { id: true },
    });
    if (dup)
      throw new ApiError(
        "ROUTE_NAME_EXISTS",
        `A route named "${body.name}" already exists`,
        409,
      );

    const row = await tx.transportRoute.create({
      data: {
        tenantId,
        name: body.name,
        nameNe: body.nameNe,
        vehicleNo: body.vehicleNo,
        driverName: body.driverName,
        driverPhone: body.driverPhone,
        capacity: body.capacity,
      },
    });

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "transport_routes",
      entityId: row.publicId,
      after: {
        name: row.name,
        vehicleNo: row.vehicleNo,
        driverName: row.driverName,
        capacity: row.capacity,
      },
    });

    return row;
  });

  return created(route);
});
