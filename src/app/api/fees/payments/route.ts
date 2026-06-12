import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { pagination, requireTenantSession, requireTenantWrite } from "@/lib/tenant";
import { kathmanduDateString, toDbDate } from "@/lib/attendance";
import { fiscalYearLabel } from "@/lib/dates/bs";
import { completePayment } from "@/lib/fees/post-payment";
import { getProvider } from "@/lib/fees/payments";

const COLLECT_ROLES = ["school_admin", "principal", "accountant", "front_desk"];

/**
 * POST /api/fees/payments — record a payment against an invoice.
 *  - cash/bank  → completed immediately: receipt number, ledger entry, invoice update
 *  - esewa/khalti → pending payment + gateway initiation payload; completion
 *    happens in the callback/verify route after a server-to-server check
 */
const createSchema = z.object({
  invoiceId: z.uuid(),
  method: z.enum(["cash", "bank", "esewa", "khalti"]),
  amountPaisa: z.number().int().positive().max(1_000_000_000),
  reference: z.string().max(120).optional(), // cheque / voucher no for bank
});

export const POST = handler(async (req: Request) => {
  const { tenantId, session } = await requireTenantWrite(COLLECT_ROLES);
  const body = await parseBody(req, createSchema);
  const fiscalYear = fiscalYearLabel(toDbDate(kathmanduDateString()));

  // 1) Create the payment row (and complete it inline for cash/bank).
  const createdPayment = await withTenant(tenantId, async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { tenantId, publicId: body.invoiceId },
      select: {
        id: true,
        invoiceNo: true,
        studentId: true,
        totalPaisa: true,
        paidPaisa: true,
        status: true,
      },
    });
    if (!invoice) throw new ApiError("NOT_FOUND", "Invoice not found", 404);
    if (invoice.status === "void")
      throw new ApiError("INVOICE_VOID", "Cannot pay a void invoice", 409);
    const outstanding = invoice.totalPaisa - invoice.paidPaisa;
    if (outstanding <= 0) throw new ApiError("ALREADY_PAID", "Invoice is fully paid", 409);
    if (body.amountPaisa > outstanding)
      throw new ApiError(
        "OVERPAYMENT",
        "Amount exceeds the outstanding balance",
        400,
        { outstandingPaisa: outstanding },
      );

    const payment = await tx.payment.create({
      data: {
        tenantId,
        fiscalYear,
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        method: body.method,
        amountPaisa: body.amountPaisa,
        reference: body.reference,
        receivedBy: session.sub,
      },
      select: { id: true, publicId: true },
    });

    if (body.method === "cash" || body.method === "bank") {
      const { receiptNo } = await completePayment(tx, {
        tenantId,
        paymentId: payment.id,
        receivedBy: session.sub,
      });
      return { ...payment, completed: true as const, receiptNo, invoiceNo: invoice.invoiceNo };
    }

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "payments",
      entityId: payment.publicId,
      after: { invoiceNo: invoice.invoiceNo, method: body.method, amountPaisa: body.amountPaisa },
    });
    return { ...payment, completed: false as const, invoiceNo: invoice.invoiceNo };
  });

  if (createdPayment.completed) {
    return ok({
      paymentId: createdPayment.publicId,
      status: "completed",
      receiptNo: createdPayment.receiptNo,
    });
  }

  // 2) Online: ask the gateway for the redirect/form (network call outside the tx).
  const origin = new URL(req.url).origin;
  const callbackBase = `${origin}/api/fees/payments/${createdPayment.publicId}/callback`;
  const provider = getProvider(body.method);
  const initiation = await provider.initiate({
    paymentPublicId: createdPayment.publicId,
    invoiceNo: createdPayment.invoiceNo,
    amountPaisa: body.amountPaisa,
    successUrl: callbackBase,
    failureUrl: `${callbackBase}?failed=1`,
  });

  if (initiation.kind === "redirect") {
    await withTenant(tenantId, (tx) =>
      tx.payment.update({
        where: { id: createdPayment.id },
        data: { providerRef: initiation.providerRef },
      }),
    );
  }

  return ok({ paymentId: createdPayment.publicId, status: "pending", initiation });
});

/**
 * GET /api/fees/payments — paginated list.
 * ?date=YYYY-MM-DD (Kathmandu paid date) &method= &status= &invoiceId=
 */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);
  const method = url.searchParams.get("method");
  const status = url.searchParams.get("status");
  const invoiceId = url.searchParams.get("invoiceId");

  const where = {
    tenantId,
    ...(method && ["cash", "bank", "esewa", "khalti"].includes(method)
      ? { method: method as "cash" | "bank" | "esewa" | "khalti" }
      : {}),
    ...(status && ["pending", "completed", "failed", "cancelled"].includes(status)
      ? { status: status as "pending" | "completed" | "failed" | "cancelled" }
      : {}),
    ...(invoiceId ? { invoice: { publicId: invoiceId } } : {}),
  };

  const [total, rows] = await withTenant(tenantId, (tx) =>
    Promise.all([
      tx.payment.count({ where }),
      tx.payment.findMany({
        where,
        orderBy: { id: "desc" },
        skip,
        take: pageSize,
        select: {
          publicId: true,
          receiptNo: true,
          method: true,
          amountPaisa: true,
          status: true,
          reference: true,
          providerRef: true,
          paidAt: true,
          createdAt: true,
          printCount: true,
          invoice: { select: { publicId: true, invoiceNo: true } },
          student: { select: { publicId: true, name: true, admissionNo: true } },
        },
      }),
    ]),
  );

  return ok(rows, { page, pageSize, total });
});
