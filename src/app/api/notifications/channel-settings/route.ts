import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";
import { channelPriorityOf } from "@/lib/notifications";

const updateSchema = z.object({
  channelPriority: z
    .array(z.enum(["whatsapp", "sms", "viber", "push"]))
    .min(1)
    .max(4),
});

/** GET — current channel priority settings. */
export const GET = handler(async () => {
  const { tenantId } = await requireTenantSession();

  const settings = await withTenant(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { settings: true },
    });
    return { channelPriority: channelPriorityOf(tenant.settings) };
  });

  return ok(settings);
});

/** PATCH — update channel priority. */
export const PATCH = handler(async (req: Request) => {
  const { tenantId, session } = await requireTenantWrite();
  const body = await parseBody(req, updateSchema);

  const result = await withTenant(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { settings: true },
    });
    const current = (tenant.settings && typeof tenant.settings === "object"
      ? tenant.settings
      : {}) as Record<string, unknown>;

    const updated = await tx.tenant.update({
      where: { id: tenantId },
      data: {
        settings: { ...current, channelPriority: body.channelPriority },
      },
      select: { settings: true },
    });
    await audit(tx, {
      tenantId,
      action: "update",
      entity: "tenants",
      after: { channelPriority: body.channelPriority },
    });
    return { channelPriority: channelPriorityOf(updated.settings) };
  });

  return ok(result);
});
