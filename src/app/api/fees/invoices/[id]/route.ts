import { z } from "zod";
import { ApiError, handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireTenantSession } from "@/lib/tenant";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/fees/invoices/[id] — full invoice with items + payments. */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantSession();
  const idResult = z.uuid().safeParse((await ctx.params).id);
  if (!idResult.success) throw new ApiError("NOT_FOUND", "Invoice not found", 404);

  const invoice = await withTenant(tenantId, (tx) =>
    tx.invoice.findFirst({
      where: { tenantId, publicId: idResult.data },
      include: {
        student: {
          select: {
            publicId: true,
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
        items: {
          select: {
            kind: true,
            label: true,
            labelNe: true,
            amountPaisa: true,
            discountPaisa: true,
          },
        },
        payments: {
          orderBy: { id: "desc" },
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
          },
        },
      },
    }),
  );
  if (!invoice) throw new ApiError("NOT_FOUND", "Invoice not found", 404);
  return ok(invoice);
});
