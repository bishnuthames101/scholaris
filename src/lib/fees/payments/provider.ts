/**
 * PaymentProvider — the seam between Scholaris and online payment gateways.
 * Adapters: eSewa (ePay v2) and Khalti (KPG-2), sandbox-first.
 * ConnectIPS / fonePay arrive in Phase 3.1 behind this same interface.
 */

export type OnlineMethod = "esewa" | "khalti";

export type InitiateInput = {
  /** Our Payment.publicId — doubles as the gateway transaction/order id. */
  paymentPublicId: string;
  invoiceNo: string;
  amountPaisa: number;
  /** Where the gateway sends the parent after success / failure. */
  successUrl: string;
  failureUrl: string;
};

export type InitiateResult =
  /** Auto-submit an HTML form to the gateway (eSewa style). */
  | { kind: "form"; action: string; fields: Record<string, string> }
  /** Plain redirect to a gateway-hosted page (Khalti style). */
  | { kind: "redirect"; url: string; providerRef: string };

export type VerifyInput = {
  paymentPublicId: string;
  amountPaisa: number;
  /** Gateway ref captured at initiation (Khalti pidx); null for eSewa. */
  providerRef: string | null;
};

export type VerifyResult = {
  ok: boolean;
  /** Final gateway transaction id to store on the payment. */
  providerRef: string | null;
  raw: unknown;
};

export interface PaymentProvider {
  readonly method: OnlineMethod;
  initiate(input: InitiateInput): Promise<InitiateResult>;
  /** Server-to-server status check — the ONLY thing we trust for completion. */
  verify(input: VerifyInput): Promise<VerifyResult>;
}
