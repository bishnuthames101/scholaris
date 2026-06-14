import { z } from "zod";
import { ApiError, created, handler, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

function parseId(id: string): string {
  const r = z.uuid().safeParse(id);
  if (!r.success) throw new ApiError("NOT_FOUND", "Route not found", 404);
  return r.data;
}

const CreateStopSchema = z.object({
  name: z.string().min(1).max(200),
  nameNe: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).default(0),
  pickupTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  dropTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

/** POST /api/transport/routes/[id]/stops — add a stop to a route. */
export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const routePid = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantWrite(["school_admin", "transport"]);
    const body = await parseBody(req, CreateStopSchema);

    const stop = await withTenant(tenantId, async (tx) => {
      const route = await tx.transportRoute.findFirst({
        where: { tenantId, publicId: routePid, deletedAt: null },
        select: { id: true },
      });
      if (!route) throw new ApiError("NOT_FOUND", "Route not found", 404);

      const dup = await tx.transportStop.findFirst({
        where: { tenantId, routeId: route.id, name: body.name },
        select: { id: true },
      });
      if (dup)
        throw new ApiError(
          "STOP_NAME_EXISTS",
          `A stop named "${body.name}" already exists on this route`,
          409,
        );

      const row = await tx.transportStop.create({
        data: {
          tenantId,
          routeId: route.id,
          name: body.name,
          nameNe: body.nameNe,
          sortOrder: body.sortOrder,
          pickupTime: body.pickupTime,
          dropTime: body.dropTime,
        },
      });

      await audit(tx, {
        tenantId,
        action: "create",
        entity: "transport_stops",
        entityId: row.publicId,
        after: {
          name: row.name,
          sortOrder: row.sortOrder,
          pickupTime: row.pickupTime,
          dropTime: row.dropTime,
          routeId: routePid,
        },
      });

      return row;
    });

    return created(stop);
  },
);
