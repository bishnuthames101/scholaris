import { ApiError } from "@/lib/api";
import type {
  InitiateInput,
  InitiateResult,
  PaymentProvider,
  VerifyInput,
  VerifyResult,
} from "./provider";

/**
 * Khalti ePayment (KPG-2) adapter — sandbox base by default.
 * Docs: docs.khalti.com — initiate returns a pidx + hosted payment_url;
 * completion is confirmed ONLY via the /epayment/lookup/ call.
 * Khalti amounts are already in paisa, which matches our storage unit.
 */

const BASE = process.env.KHALTI_BASE_URL ?? "https://dev.khalti.com/api/v2";

function secretKey(): string {
  const key = process.env.KHALTI_SECRET_KEY;
  if (!key) {
    throw new ApiError(
      "PROVIDER_NOT_CONFIGURED",
      "Khalti is not configured (set KHALTI_SECRET_KEY)",
      503,
    );
  }
  return key;
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `key ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { detail?: string };
  if (!res.ok) {
    throw new ApiError(
      "PROVIDER_ERROR",
      `Khalti error (${res.status}): ${data.detail ?? "request failed"}`,
      502,
      data,
    );
  }
  return data;
}

export const khaltiProvider: PaymentProvider = {
  method: "khalti",

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const data = await call<{ pidx: string; payment_url: string }>("/epayment/initiate/", {
      return_url: input.successUrl,
      website_url: new URL(input.successUrl).origin,
      amount: input.amountPaisa,
      purchase_order_id: input.paymentPublicId,
      purchase_order_name: input.invoiceNo,
    });
    return { kind: "redirect", url: data.payment_url, providerRef: data.pidx };
  },

  async verify(input: VerifyInput): Promise<VerifyResult> {
    if (!input.providerRef) return { ok: false, providerRef: null, raw: null };
    const data = await call<{ status?: string; transaction_id?: string | null }>(
      "/epayment/lookup/",
      { pidx: input.providerRef },
    );
    return {
      ok: data.status === "Completed",
      providerRef: data.transaction_id ?? input.providerRef,
      raw: data,
    };
  },
};
