import { handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireTenantWrite } from "@/lib/tenant";
import { processEvents } from "@/lib/notifications";

/**
 * POST — process pending domain events and send notifications.
 * In production this would be called by a cron job; here it's manually triggered.
 */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite();
  const url = new URL(req.url);
  const batchSize = Math.max(1, Math.min(100, Number(url.searchParams.get("batchSize") ?? 50) || 50));

  const result = await withTenant(
    tenantId,
    (tx) => processEvents(tx as never, tenantId, batchSize),
    { timeoutMs: 120_000 },
  );

  return ok(result);
});
