import type { Prisma } from "@prisma/client";

/**
 * Fiscal-year document numbering (IRD requirement: sequential, gap-aware,
 * resets each fiscal year). Sequences come from `doc_counters` via a single
 * atomic upsert — the row lock serializes concurrent allocations, and bulk
 * generation reserves N numbers in one round trip (Singapore pooler friendly).
 */

export type DocKind = "invoice" | "receipt" | "application";

/** Reserve `count` sequence numbers; returns them in ascending order. */
export async function nextSequences(
  tx: Prisma.TransactionClient,
  tenantId: bigint,
  kind: DocKind,
  fiscalYear: string,
  count: number,
): Promise<number[]> {
  if (count < 1) return [];
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO doc_counters (tenant_id, kind, fiscal_year, value)
    VALUES (${tenantId}, ${kind}, ${fiscalYear}, ${count})
    ON CONFLICT (tenant_id, kind, fiscal_year)
    DO UPDATE SET value = doc_counters.value + ${count}
    RETURNING value
  `;
  const end = rows[0].value;
  return Array.from({ length: count }, (_, i) => end - count + 1 + i);
}

export function formatInvoiceNo(fiscalYear: string, seq: number): string {
  return `${fiscalYear}-INV-${String(seq).padStart(6, "0")}`;
}

export function formatReceiptNo(fiscalYear: string, seq: number): string {
  return `${fiscalYear}-RCP-${String(seq).padStart(6, "0")}`;
}

export function formatApplicationNo(fiscalYear: string, seq: number): string {
  return `${fiscalYear}-APP-${String(seq).padStart(6, "0")}`;
}
