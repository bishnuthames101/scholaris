import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

type Ctx = { params: Promise<{ id: string }> };

function parseId(id: string): string {
  const r = z.uuid().safeParse(id);
  if (!r.success) throw new ApiError("NOT_FOUND", "Device not found", 404);
  return r.data;
}

const UpdateDeviceSchema = z
  .object({
    name: z.string().min(1).max(100),
    location: z.enum(["gate", "classroom", "bus"]),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });

/** PATCH /api/rfid/devices/[id] — update name/location/isActive (never secret). */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite();
  const id = parseId((await ctx.params).id);
  const body = await parseBody(req, UpdateDeviceSchema);

  const updated = await withTenant(tenantId, async (tx) => {
    const existing = await tx.rfidDevice.findFirst({
      where: { tenantId, publicId: id, deletedAt: null },
    });
    if (!existing) throw new ApiError("NOT_FOUND", "Device not found", 404);

    const keys = Object.keys(body) as (keyof typeof body)[];
    const before = Object.fromEntries(keys.map((k) => [k, existing[k]]));
    const row = await tx.rfidDevice.update({ where: { id: existing.id }, data: body });
    const after = Object.fromEntries(keys.map((k) => [k, row[k]]));

    await audit(tx, {
      tenantId,
      action: "update",
      entity: "rfid_devices",
      entityId: row.publicId,
      before,
      after,
    });

    return row;
  });

  return ok({
    publicId: updated.publicId,
    deviceId: updated.deviceId,
    name: updated.name,
    location: updated.location,
    isActive: updated.isActive,
    lastSeenAt: updated.lastSeenAt,
    lastReportedAt: updated.lastReportedAt,
    createdAt: updated.createdAt,
  });
});

/** DELETE /api/rfid/devices/[id] — soft delete + deactivate. */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite();
  const id = parseId((await ctx.params).id);

  await withTenant(tenantId, async (tx) => {
    const existing = await tx.rfidDevice.findFirst({
      where: { tenantId, publicId: id, deletedAt: null },
    });
    if (!existing) throw new ApiError("NOT_FOUND", "Device not found", 404);

    await tx.rfidDevice.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await audit(tx, {
      tenantId,
      action: "soft_delete",
      entity: "rfid_devices",
      entityId: existing.publicId,
      before: { deviceId: existing.deviceId, name: existing.name, isActive: existing.isActive },
    });
  });

  return ok({ deleted: true });
});
