import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiError } from "./api";
import { withTenant } from "./db";

/**
 * RFID device authentication (§5.8, §7.3).
 *
 * Each device has a per-device HMAC secret. Requests carry:
 *   x-device-id:  hardware identifier (e.g. "GATE-01")
 *   x-signature:  hex HMAC-SHA256 over the raw request body (POST)
 *                 or over the x-timestamp header value (GET)
 *   x-timestamp:  ISO timestamp (GET only; ±10 min skew allowed)
 *
 * Replay safety for ingestion comes from idempotency: rfid_events dedupes on
 * (device, uid, tapped_at), so replaying a batch is a no-op.
 */

export function generateDeviceSecret(): string {
  return randomBytes(32).toString("hex");
}

export function hmacSign(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("hex");
}

export function hmacVerify(secret: string, data: string, signature: string): boolean {
  const expected = Buffer.from(hmacSign(secret, data), "hex");
  let given: Buffer;
  try {
    given = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(expected, given);
}

export type AuthedDevice = {
  id: bigint;
  publicId: string;
  tenantId: bigint;
  deviceId: string;
  location: string;
};

const GET_SKEW_MS = 10 * 60 * 1000;

/**
 * Authenticate a device request. `signedData` is the exact string the device
 * signed (raw body for POST; x-timestamp value for GET).
 *
 * deviceId is unique per tenant, not globally — if two schools name a reader
 * "GATE-01", the signature decides which one is talking.
 */
export async function authenticateDevice(
  req: Request,
  signedData: string,
  opts: { requireTimestamp?: boolean } = {},
): Promise<AuthedDevice> {
  const deviceId = req.headers.get("x-device-id");
  const signature = req.headers.get("x-signature");
  if (!deviceId || !signature)
    throw new ApiError("DEVICE_AUTH", "Missing x-device-id or x-signature header", 401);

  if (opts.requireTimestamp) {
    const ts = req.headers.get("x-timestamp");
    const t = ts ? Date.parse(ts) : NaN;
    if (Number.isNaN(t) || Math.abs(Date.now() - t) > GET_SKEW_MS)
      throw new ApiError("DEVICE_AUTH", "Invalid or stale x-timestamp", 401);
  }

  // Cross-tenant lookup (platform-level): the device is the principal here.
  const candidates = await withTenant(
    null,
    (tx) =>
      tx.rfidDevice.findMany({
        where: { deviceId, isActive: true, deletedAt: null },
        select: {
          id: true,
          publicId: true,
          tenantId: true,
          deviceId: true,
          location: true,
          secret: true,
        },
      }),
    { superadmin: true },
  );

  for (const d of candidates) {
    if (hmacVerify(d.secret, signedData, signature)) {
      return {
        id: d.id,
        publicId: d.publicId,
        tenantId: d.tenantId,
        deviceId: d.deviceId,
        location: d.location,
      };
    }
  }
  throw new ApiError("DEVICE_AUTH", "Unknown device or bad signature", 401);
}
