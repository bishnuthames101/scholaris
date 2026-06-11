import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";
import { attendanceSettingsOf, isValidCutoff } from "@/lib/attendance";

/** GET /api/settings/attendance — current attendance settings (with defaults). */
export const GET = handler(async () => {
  const { tenantId } = await requireTenantSession();

  const tenant = await withTenant(tenantId, async (tx) => {
    const row = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!row) throw new ApiError("NOT_FOUND", "Tenant not found", 404);
    return row;
  });

  return ok(attendanceSettingsOf(tenant.settings));
});

const PatchSchema = z
  .object({
    messagingMode: z.enum(["off", "absence_only", "per_tap"]),
    absenceCutoff: z.string(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });

/** PATCH /api/settings/attendance — update messaging mode / absence cutoff. */
export const PATCH = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(["school_admin", "principal"]);
  const body = await parseBody(req, PatchSchema);

  if (body.absenceCutoff !== undefined && !isValidCutoff(body.absenceCutoff))
    throw new ApiError("INVALID_CUTOFF", "absenceCutoff must be HH:MM (24-hour)", 422);

  const next = await withTenant(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { publicId: true, settings: true },
    });
    if (!tenant) throw new ApiError("NOT_FOUND", "Tenant not found", 404);

    const before = attendanceSettingsOf(tenant.settings);
    const after = { ...before, ...body };

    const baseSettings =
      tenant.settings && typeof tenant.settings === "object" && !Array.isArray(tenant.settings)
        ? (tenant.settings as Record<string, unknown>)
        : {};

    await tx.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...baseSettings, attendance: after } },
    });

    await audit(tx, {
      tenantId,
      action: "update",
      entity: "tenants",
      entityId: tenant.publicId,
      before,
      after,
    });

    return after;
  });

  return ok(next);
});
