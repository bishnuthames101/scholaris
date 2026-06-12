import { createHmac } from "crypto";
import { paisaToNpr } from "@/lib/fees/money";
import type {
  InitiateInput,
  InitiateResult,
  PaymentProvider,
  VerifyInput,
  VerifyResult,
} from "./provider";

/**
 * eSewa ePay v2 adapter (sandbox by default).
 * Docs: developer.esewa.com.np — form POST with HMAC-SHA256(base64) signature
 * over "total_amount=…,transaction_uuid=…,product_code=…".
 * Completion is confirmed ONLY via the server-to-server status check.
 */

const PRODUCT_CODE = process.env.ESEWA_PRODUCT_CODE ?? "EPAYTEST";
const SECRET = process.env.ESEWA_SECRET_KEY ?? "8gBm/:&EnhH.1/q"; // public UAT secret
const FORM_URL =
  process.env.ESEWA_FORM_URL ?? "https://rc-epay.esewa.com.np/api/epay/main/v2/form";
const STATUS_URL =
  process.env.ESEWA_STATUS_URL ?? "https://rc.esewa.com.np/api/epay/transaction/status/";

function sign(totalAmount: string, transactionUuid: string): string {
  const message = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${PRODUCT_CODE}`;
  return createHmac("sha256", SECRET).update(message).digest("base64");
}

export const esewaProvider: PaymentProvider = {
  method: "esewa",

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const total = paisaToNpr(input.amountPaisa);
    return {
      kind: "form",
      action: FORM_URL,
      fields: {
        amount: total,
        tax_amount: "0",
        total_amount: total,
        transaction_uuid: input.paymentPublicId,
        product_code: PRODUCT_CODE,
        product_service_charge: "0",
        product_delivery_charge: "0",
        success_url: input.successUrl,
        failure_url: input.failureUrl,
        signed_field_names: "total_amount,transaction_uuid,product_code",
        signature: sign(total, input.paymentPublicId),
      },
    };
  },

  async verify(input: VerifyInput): Promise<VerifyResult> {
    const total = paisaToNpr(input.amountPaisa);
    const url =
      `${STATUS_URL}?product_code=${encodeURIComponent(PRODUCT_CODE)}` +
      `&total_amount=${encodeURIComponent(total)}` +
      `&transaction_uuid=${encodeURIComponent(input.paymentPublicId)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { ok: false, providerRef: null, raw: { status: res.status } };
    const data = (await res.json()) as { status?: string; ref_id?: string | null };
    return {
      ok: data.status === "COMPLETE",
      providerRef: data.ref_id ?? null,
      raw: data,
    };
  },
};
