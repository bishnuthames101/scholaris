import { z } from "zod";
import { ApiError, handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";
import { generateDeviceSecret } from "@/lib/rfid-auth";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/rfid/devices/[id]/rotate-secret — issue a new HMAC secret (shown once). */
export const POST = handler(async (_req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite();
  const idResult = z.uuid().safeParse((await ctx.params).id);
  if (!idResult.success) throw new ApiError("NOT_FOUND", "Device not found", 404);
  const id = idResult.data;

  const device = await withTenant(tenantId, async (tx) => {
    const existing = await tx.rfidDevice.findFirst({
      where: { tenantId, publicId: id, deletedAt: null },
    });
    if (!existing) throw new ApiError("NOT_FOUND", "Device not found", 404);

    const row = await tx.rfidDevice.update({
      where: { id: existing.id },
      data: { secret: generateDeviceSecret() },
    });

    // Record THAT the secret rotated — never the secret value itself.
    await audit(tx, {
      tenantId,
      action: "update",
      entity: "rfid_devices",
      entityId: row.publicId,
      after: { secretRotated: true },
    });

    return row;
  });

  // New secret returned exactly once — copy it onto the device now.
  return ok({ publicId: device.publicId, deviceId: device.deviceId, secret: device.secret });
});
