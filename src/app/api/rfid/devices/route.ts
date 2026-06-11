import { z } from "zod";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";
import { kathmanduDateString } from "@/lib/attendance";
import { generateDeviceSecret } from "@/lib/rfid-auth";

// Device fields safe to return — NEVER select/return `secret` on reads.
const DEVICE_SELECT = {
  publicId: true,
  deviceId: true,
  name: true,
  location: true,
  isActive: true,
  lastSeenAt: true,
  lastReportedAt: true,
  createdAt: true,
} as const;

/** GET /api/rfid/devices — list RFID devices (secret never included). */
export const GET = handler(async () => {
  const { tenantId } = await requireTenantWrite();

  const rows = await withTenant(tenantId, (tx) =>
    tx.rfidDevice.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: DEVICE_SELECT,
    }),
  );

  const today = kathmanduDateString();
  const devices = rows.map((d) => ({
    ...d,
    reportedToday: d.lastReportedAt != null && kathmanduDateString(d.lastReportedAt) === today,
  }));

  return ok({ devices });
});

const CreateDeviceSchema = z.object({
  deviceId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, "Only letters, digits, dot, underscore and hyphen allowed"),
  name: z.string().min(1).max(100),
  location: z.enum(["gate", "classroom", "bus"]).default("gate"),
});

/** POST /api/rfid/devices — register a device. Returns the HMAC secret ONCE. */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite();
  const body = await parseBody(req, CreateDeviceSchema);

  const device = await withTenant(tenantId, async (tx) => {
    const dup = await tx.rfidDevice.findFirst({
      where: { tenantId, deviceId: body.deviceId },
      select: { id: true },
    });
    if (dup) throw new ApiError("DUPLICATE", "Device ID already exists", 409);

    let row;
    try {
      row = await tx.rfidDevice.create({
        data: {
          tenantId,
          deviceId: body.deviceId,
          name: body.name,
          location: body.location,
          secret: generateDeviceSecret(),
        },
      });
    } catch (err) {
      // Race with the pre-check: unique (tenant_id, device_id) violation.
      if (err && typeof err === "object" && (err as { code?: string }).code === "P2002")
        throw new ApiError("DUPLICATE", "Device ID already exists", 409);
      throw err;
    }

    // NEVER put the secret in the audit log.
    await audit(tx, {
      tenantId,
      action: "create",
      entity: "rfid_devices",
      entityId: row.publicId,
      after: { deviceId: row.deviceId, name: row.name, location: row.location },
    });

    return row;
  });

  // The ONLY time the secret is ever returned: the caller must copy it onto
  // the physical device now — it is not retrievable later (only rotatable).
  return created({
    publicId: device.publicId,
    deviceId: device.deviceId,
    name: device.name,
    location: device.location,
    isActive: device.isActive,
    lastSeenAt: device.lastSeenAt,
    lastReportedAt: device.lastReportedAt,
    createdAt: device.createdAt,
    secret: device.secret,
  });
});
