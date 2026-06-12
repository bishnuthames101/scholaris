import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

type Ctx = { params: Promise<{ id: string }> };

const FEE_ROLES = ["school_admin", "principal", "accountant"];

const bodySchema = z.object({ reason: z.string().min(3).max(500) });

/**
 * POST /api/fees/invoices/[id]/void — IRD-compliant cancellation.
 * The invoice row stays (no hard delete, ever); a reversing ledger entry
 * credits the original charge. Invoices with completed payments cannot be
 * voided — refund/reverse the payments first.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId, session } = await requireTenantWrite(FEE_ROLES);
  const idResult = z.uuid().safeParse((await ctx.params).id);
  if (!idResult.success) throw new ApiError("NOT_FOUND", "Invoice not found", 404);
  const { reason } = await parseBody(req, bodySchema);

  const result = await withTenant(tenantId, async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { tenantId, publicId: idResult.data },
      select: {
        id: true,
        publicId: true,
        invoiceNo: true,
        studentId: true,
        totalPaisa: true,
        status: true,
        payments: { where: { status: "completed" }, select: { id: true }, take: 1 },
      },
    });
    if (!invoice) throw new ApiError("NOT_FOUND", "Invoice not found", 404);
    if (invoice.status === "void")
      throw new ApiError("ALREADY_VOID", "Invoice is already void", 409);
    if (invoice.payments.length > 0)
      throw new ApiError(
        "HAS_PAYMENTS",
        "Invoice has completed payments — reverse them before voiding",
        409,
      );

    const row = await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: "void", voidReason: reason, voidedAt: new Date() },
      select: { publicId: true, invoiceNo: true, status: true, voidReason: true, voidedAt: true },
    });

    await tx.ledgerEntry.create({
      data: {
        tenantId,
        studentId: invoice.studentId,
        invoiceId: invoice.id,
        type: "invoice_voided",
        creditPaisa: invoice.totalPaisa, // reverses the original debit
        narration: `Invoice ${invoice.invoiceNo} voided: ${reason}`,
        createdBy: session.sub,
      },
    });

    await audit(tx, {
      tenantId,
      action: "update",
      entity: "invoices",
      entityId: invoice.publicId,
      after: { status: "void" },
      reason,
    });

    return row;
  });

  return ok(result);
});
