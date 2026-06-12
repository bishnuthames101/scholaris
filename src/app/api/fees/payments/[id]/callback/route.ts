import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/db";
import { completePayment } from "@/lib/fees/post-payment";
import { getProvider } from "@/lib/fees/payments";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/fees/payments/[id]/callback — gateway return URL (browser redirect).
 *
 * Deliberately unauthenticated: the parent's browser may not carry a staff
 * session. Safe because nothing is trusted from the query string — completion
 * happens ONLY after our server-to-server verification with the gateway, and
 * the response is just a redirect to the invoice page.
 */
export async function GET(req: Request, ctx: Ctx) {
  const url = new URL(req.url);
  const idResult = z.uuid().safeParse((await ctx.params).id);
  if (!idResult.success) return NextResponse.redirect(`${url.origin}/fees?payment=invalid`);
  const publicId = idResult.data;

  // Cross-tenant lookup by unguessable payment publicId.
  const payment = await withTenant(null, (tx) =>
    tx.payment.findFirst({
      where: { publicId },
      select: {
        id: true,
        tenantId: true,
        method: true,
        status: true,
        amountPaisa: true,
        providerRef: true,
        invoice: { select: { publicId: true } },
      },
    }),
    { superadmin: true },
  );
  if (!payment) return NextResponse.redirect(`${url.origin}/fees?payment=invalid`);

  const invoiceUrl = `${url.origin}/fees/invoices/${payment.invoice.publicId}`;
  if (payment.status === "completed")
    return NextResponse.redirect(`${invoiceUrl}?payment=completed`);

  if (url.searchParams.get("failed") === "1") {
    await withTenant(payment.tenantId, (tx) =>
      tx.payment.update({ where: { id: payment.id }, data: { status: "failed" } }),
    );
    return NextResponse.redirect(`${invoiceUrl}?payment=failed`);
  }

  // Khalti returns ?pidx=… on the success URL; prefer it over the stored ref.
  const pidx = url.searchParams.get("pidx");
  const provider = getProvider(payment.method);
  let verified = false;
  let providerRef: string | null = null;
  let raw: unknown = null;
  try {
    const result = await provider.verify({
      paymentPublicId: publicId,
      amountPaisa: payment.amountPaisa,
      providerRef: pidx ?? payment.providerRef,
    });
    verified = result.ok;
    providerRef = result.providerRef;
    raw = result.raw;
  } catch {
    verified = false;
  }

  if (!verified) {
    await withTenant(payment.tenantId, (tx) =>
      tx.payment.update({ where: { id: payment.id }, data: { status: "failed" } }),
    );
    return NextResponse.redirect(`${invoiceUrl}?payment=failed`);
  }

  await withTenant(payment.tenantId, (tx) =>
    completePayment(tx, {
      tenantId: payment.tenantId,
      paymentId: payment.id,
      providerRef,
      providerPayload: raw,
    }),
  );
  return NextResponse.redirect(`${invoiceUrl}?payment=completed`);
}
