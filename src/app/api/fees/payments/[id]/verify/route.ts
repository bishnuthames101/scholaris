import { z } from "zod";
import { ApiError, handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireTenantWrite } from "@/lib/tenant";
import { completePayment } from "@/lib/fees/post-payment";
import { getProvider } from "@/lib/fees/payments";

type Ctx = { params: Promise<{ id: string }> };

const COLLECT_ROLES = ["school_admin", "principal", "accountant", "front_desk"];

/**
 * POST /api/fees/payments/[id]/verify — re-check a pending online payment
 * against the gateway (used when the parent closed the browser before the
 * callback fired). Completes or fails the payment based on the lookup.
 */
export const POST = handler(async (_req: Request, ctx: Ctx) => {
  const { tenantId, session } = await requireTenantWrite(COLLECT_ROLES);
  const idResult = z.uuid().safeParse((await ctx.params).id);
  if (!idResult.success) throw new ApiError("NOT_FOUND", "Payment not found", 404);

  const payment = await withTenant(tenantId, (tx) =>
    tx.payment.findFirst({
      where: { tenantId, publicId: idResult.data },
      select: { id: true, method: true, status: true, amountPaisa: true, providerRef: true },
    }),
  );
  if (!payment) throw new ApiError("NOT_FOUND", "Payment not found", 404);
  if (payment.status === "completed") return ok({ status: "completed" });
  if (payment.method === "cash" || payment.method === "bank")
    throw new ApiError("NOT_ONLINE", "Only online payments can be verified", 400);

  const result = await getProvider(payment.method).verify({
    paymentPublicId: idResult.data,
    amountPaisa: payment.amountPaisa,
    providerRef: payment.providerRef,
  });

  if (!result.ok) {
    await withTenant(tenantId, (tx) =>
      tx.payment.update({ where: { id: payment.id }, data: { status: "failed" } }),
    );
    return ok({ status: "failed", raw: result.raw });
  }

  const { receiptNo } = await withTenant(tenantId, (tx) =>
    completePayment(tx, {
      tenantId,
      paymentId: payment.id,
      providerRef: result.providerRef,
      providerPayload: result.raw,
      receivedBy: session.sub,
    }),
  );
  return ok({ status: "completed", receiptNo });
});
