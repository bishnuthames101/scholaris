/**
 * CBMS (IRD Central Billing Management System) adapter boundary — STUB.
 *
 * When a school becomes CBMS-mandated, invoices must be pushed to the IRD in
 * real time (or batched per the IRD's offline allowance). Everything CBMS
 * needs already exists in our model:
 *   - sequential fiscal-year invoice numbers (`invoices.invoice_no`)
 *   - immutable financial history (`ledger_entries`, append-only via RLS)
 *   - reprint labelling (`invoices.print_count` → "Copy of Original")
 *   - void-with-reason instead of deletion (`invoices.status = void`)
 *
 * Implementation plan (Phase 3.x, when credentials exist):
 *   1. Register the taxpayer + get CBMS API credentials per school (tenant
 *      settings: `cbms.username/password/sellerPan`).
 *   2. On invoice issue/void, enqueue a `cbms.push` domain event.
 *   3. A consumer calls the IRD endpoint (api/bill, api/billcancel) with
 *      retry + `is_realtime` flag for late syncs; store the ack in `meta`.
 */

export type CbmsInvoicePayload = {
  invoiceNo: string;
  fiscalYear: string;
  issuedAtIso: string;
  totalPaisa: number;
  buyerName: string;
  isRealtime: boolean;
};

export interface CbmsAdapter {
  /** Push an issued invoice to the IRD. Returns whether the IRD accepted it. */
  pushInvoice(payload: CbmsInvoicePayload): Promise<{ accepted: boolean; raw?: unknown }>;
  /** Report a voided invoice. */
  cancelInvoice(invoiceNo: string, reason: string): Promise<{ accepted: boolean; raw?: unknown }>;
}

/** No-op adapter used until a tenant is CBMS-registered. */
export const noopCbmsAdapter: CbmsAdapter = {
  async pushInvoice() {
    return { accepted: true };
  },
  async cancelInvoice() {
    return { accepted: true };
  },
};

export function getCbmsAdapter(): CbmsAdapter {
  return noopCbmsAdapter;
}
