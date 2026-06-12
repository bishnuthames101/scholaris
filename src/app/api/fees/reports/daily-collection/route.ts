import { handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireTenantSession } from "@/lib/tenant";
import { KATHMANDU_OFFSET_MIN, kathmanduDateString, toDbDate } from "@/lib/attendance";

/**
 * GET /api/fees/reports/daily-collection?date=YYYY-MM-DD
 * All completed payments whose paid_at falls inside the Kathmandu calendar
 * day — per-method totals plus the receipt list (a cashier's day-close sheet).
 */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const dateStr = url.searchParams.get("date") ?? kathmanduDateString();
  const start = new Date(toDbDate(dateStr).getTime() - KATHMANDU_OFFSET_MIN * 60_000);
  const end = new Date(start.getTime() + 24 * 60 * 60_000);

  const payments = await withTenant(tenantId, (tx) =>
    tx.payment.findMany({
      where: { tenantId, status: "completed", paidAt: { gte: start, lt: end } },
      orderBy: { seq: "asc" },
      select: {
        publicId: true,
        receiptNo: true,
        method: true,
        amountPaisa: true,
        reference: true,
        providerRef: true,
        paidAt: true,
        invoice: { select: { publicId: true, invoiceNo: true } },
        student: { select: { publicId: true, name: true, admissionNo: true } },
      },
    }),
  );

  const byMethod: Record<string, { count: number; totalPaisa: number }> = {};
  let totalPaisa = 0;
  for (const p of payments) {
    const m = (byMethod[p.method] ??= { count: 0, totalPaisa: 0 });
    m.count += 1;
    m.totalPaisa += p.amountPaisa;
    totalPaisa += p.amountPaisa;
  }

  return ok({ date: dateStr, count: payments.length, totalPaisa, byMethod, payments });
});
