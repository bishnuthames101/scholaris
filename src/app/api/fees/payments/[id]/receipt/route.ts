import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handler } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireTenantSession } from "@/lib/tenant";
import { bsMonthName } from "@/lib/dates/bs";
import { renderReceiptPdf } from "@/lib/fees/receipt-pdf";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/fees/payments/[id]/receipt — bilingual A5 receipt PDF.
 * Increments print_count atomically; any print after the first carries the
 * IRD-required "Copy of Original" label.
 */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantSession();
  const idResult = z.uuid().safeParse((await ctx.params).id);
  if (!idResult.success) throw new ApiError("NOT_FOUND", "Payment not found", 404);

  const data = await withTenant(tenantId, async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { tenantId, publicId: idResult.data, status: "completed" },
      select: {
        id: true,
        receiptNo: true,
        method: true,
        amountPaisa: true,
        reference: true,
        providerRef: true,
        paidAt: true,
        receivedBy: true,
        printCount: true,
        invoice: { select: { invoiceNo: true, bsYear: true, bsMonth: true } },
        student: {
          select: {
            name: true,
            nameNe: true,
            admissionNo: true,
            enrollments: {
              where: { deletedAt: null, academicYear: { isCurrent: true } },
              select: {
                rollNo: true,
                section: { select: { name: true, class: { select: { name: true } } } },
              },
              take: 1,
            },
          },
        },
      },
    });
    if (!payment) throw new ApiError("NOT_FOUND", "Completed payment not found", 404);

    const [tenant, receiver] = await Promise.all([
      tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { name: true, nameNe: true, address: true, phone: true, panVatNo: true },
      }),
      payment.receivedBy
        ? tx.user.findFirst({ where: { publicId: payment.receivedBy }, select: { name: true } })
        : null,
    ]);

    // Count this print; label is based on how many prints happened BEFORE it.
    await tx.payment.update({
      where: { id: payment.id },
      data: { printCount: { increment: 1 } },
    });

    return { payment, tenant, receiverName: receiver?.name ?? null };
  });

  const { payment, tenant, receiverName } = data;
  const enrollment = payment.student.enrollments[0];
  const periodLabel = payment.invoice.bsMonth
    ? `${bsMonthName(payment.invoice.bsMonth)} ${payment.invoice.bsYear}`
    : null;

  const pdf = await renderReceiptPdf({
    school: tenant,
    receiptNo: payment.receiptNo ?? "—",
    paidAt: payment.paidAt ?? new Date(),
    method: payment.method,
    reference: payment.reference,
    providerRef: payment.providerRef,
    amountPaisa: payment.amountPaisa,
    invoiceNo: payment.invoice.invoiceNo,
    periodLabel,
    student: {
      name: payment.student.name,
      nameNe: payment.student.nameNe,
      admissionNo: payment.student.admissionNo,
      className: enrollment?.section.class.name ?? null,
      sectionName: enrollment?.section.name ?? null,
      rollNo: enrollment?.rollNo ?? null,
    },
    receivedByName: receiverName,
    priorPrints: payment.printCount,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${(payment.receiptNo ?? "receipt").replace(/[^\w.-]/g, "_")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});
