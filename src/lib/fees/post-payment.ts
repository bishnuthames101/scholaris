import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { formatReceiptNo, nextSequences } from "./numbering";

/**
 * Marks a payment as completed — the single choke point shared by manual
 * (cash/bank) entry and online (eSewa/Khalti) verification. Inside one
 * transaction it: assigns the fiscal-year receipt number, updates the
 * invoice's paid amount + status, and appends the immutable ledger entry.
 */
export async function completePayment(
  tx: Prisma.TransactionClient,
  args: {
    tenantId: bigint;
    paymentId: bigint;
    providerRef?: string | null;
    providerPayload?: unknown;
    receivedBy?: string | null;
  },
): Promise<{ receiptNo: string }> {
  const { tenantId, paymentId } = args;

  const payment = await tx.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { invoice: { select: { id: true, invoiceNo: true, totalPaisa: true, paidPaisa: true } } },
  });
  if (payment.status === "completed") return { receiptNo: payment.receiptNo ?? "" };

  const [seq] = await nextSequences(tx, tenantId, "receipt", payment.fiscalYear, 1);
  const receiptNo = formatReceiptNo(payment.fiscalYear, seq);
  const paidAt = new Date();

  await tx.payment.update({
    where: { id: paymentId },
    data: {
      status: "completed",
      receiptNo,
      seq,
      paidAt,
      providerRef: args.providerRef ?? payment.providerRef,
      providerPayload: (args.providerPayload as Prisma.InputJsonValue) ?? undefined,
      receivedBy: args.receivedBy ?? payment.receivedBy,
    },
  });

  const newPaid = payment.invoice.paidPaisa + payment.amountPaisa;
  await tx.invoice.update({
    where: { id: payment.invoice.id },
    data: {
      paidPaisa: newPaid,
      status: newPaid >= payment.invoice.totalPaisa ? "paid" : "partially_paid",
    },
  });

  await tx.ledgerEntry.create({
    data: {
      tenantId,
      studentId: payment.studentId,
      invoiceId: payment.invoice.id,
      paymentId: payment.id,
      type: "payment_received",
      creditPaisa: payment.amountPaisa,
      narration: `Receipt ${receiptNo} — ${payment.method} payment against ${payment.invoice.invoiceNo}`,
      meta: { method: payment.method, providerRef: args.providerRef ?? null },
      createdBy: args.receivedBy ?? null,
    },
  });

  await audit(tx, {
    tenantId,
    action: "payment_completed",
    entity: "payments",
    entityId: payment.publicId,
    after: {
      receiptNo,
      invoiceNo: payment.invoice.invoiceNo,
      method: payment.method,
      amountPaisa: payment.amountPaisa,
    },
  });

  return { receiptNo };
}
