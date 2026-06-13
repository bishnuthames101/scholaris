import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";
import { addCredits } from "@/lib/notifications";

const topupSchema = z.object({
  amount: z.number().int().positive().max(100000),
  reason: z.string().default("topup"),
});

/** POST — add credits to tenant (admin / superadmin). */
export const POST = handler(async (req: Request) => {
  const { tenantId, session } = await requireTenantWrite();
  const body = await parseBody(req, topupSchema);

  const newBalance = await withTenant(tenantId, async (tx) => {
    const bal = await addCredits(tx as never, tenantId, body.amount, body.reason, session.sub);
    await audit(tx, {
      tenantId,
      action: "credit_topup",
      entity: "message_credits",
      after: { amount: body.amount, newBalance: bal, reason: body.reason },
    });
    return bal;
  });

  return ok({ balance: newBalance });
});
