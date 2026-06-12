import { z } from "zod";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

const FEE_ROLES = ["school_admin", "principal", "accountant"];

type Ctx = { params: Promise<{ id: string }> };

function parseStudentId(id: string): string {
  const r = z.uuid().safeParse(id);
  if (!r.success) throw new ApiError("NOT_FOUND", "Student not found", 404);
  return r.data;
}

/** GET /api/fees/students/[id]/discounts — list a student's active discounts. */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantSession();
  const studentId = parseStudentId((await ctx.params).id);

  const rows = await withTenant(tenantId, async (tx) => {
    const student = await tx.student.findFirst({
      where: { tenantId, publicId: studentId, deletedAt: null },
      select: { id: true },
    });
    if (!student) throw new ApiError("NOT_FOUND", "Student not found", 404);

    return tx.studentDiscount.findMany({
      where: { tenantId, studentId: student.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { feeHead: { select: { publicId: true, name: true, nameNe: true } } },
    });
  });

  return ok(rows);
});

const CreateDiscountSchema = z
  .object({
    feeHeadId: z.uuid().optional(), // absent = applies to every head
    type: z.enum(["percent", "fixed"]),
    value: z.number().int(),
    reason: z.string().max(200).optional(),
  })
  .refine(
    (v) => (v.type === "percent" ? v.value >= 1 && v.value <= 100 : true),
    { message: "Percent value must be between 1 and 100", path: ["value"] },
  )
  .refine(
    (v) => (v.type === "fixed" ? v.value >= 1 && v.value <= 1_000_000_000 : true),
    { message: "Fixed value must be between 1 and 1,000,000,000 paisa", path: ["value"] },
  );

/** POST /api/fees/students/[id]/discounts — add a discount/scholarship. */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite(FEE_ROLES);
  const studentId = parseStudentId((await ctx.params).id);
  const body = await parseBody(req, CreateDiscountSchema);

  const discount = await withTenant(tenantId, async (tx) => {
    const student = await tx.student.findFirst({
      where: { tenantId, publicId: studentId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!student) throw new ApiError("NOT_FOUND", "Student not found", 404);

    let head: { id: bigint; name: string } | null = null;
    if (body.feeHeadId) {
      head = await tx.feeHead.findFirst({
        where: { tenantId, publicId: body.feeHeadId, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!head) throw new ApiError("INVALID_HEAD", "Fee head does not exist", 400);
    }

    const row = await tx.studentDiscount.create({
      data: {
        tenantId,
        studentId: student.id,
        feeHeadId: head?.id ?? null,
        type: body.type,
        value: body.value,
        reason: body.reason ?? null,
      },
      include: { feeHead: { select: { publicId: true, name: true, nameNe: true } } },
    });

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "student_discounts",
      entityId: row.publicId,
      after: {
        student: student.name,
        feeHead: head?.name ?? null,
        type: row.type,
        value: row.value,
        reason: row.reason,
      },
    });

    return row;
  });

  return created(discount);
});

const DeleteDiscountSchema = z.object({
  discountId: z.uuid(),
});

/** DELETE /api/fees/students/[id]/discounts — soft delete a discount. */
export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite(FEE_ROLES);
  const studentId = parseStudentId((await ctx.params).id);
  const body = await parseBody(req, DeleteDiscountSchema);

  await withTenant(tenantId, async (tx) => {
    const student = await tx.student.findFirst({
      where: { tenantId, publicId: studentId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!student) throw new ApiError("NOT_FOUND", "Student not found", 404);

    const existing = await tx.studentDiscount.findFirst({
      where: { tenantId, publicId: body.discountId, studentId: student.id, deletedAt: null },
      include: { feeHead: { select: { name: true } } },
    });
    if (!existing) throw new ApiError("NOT_FOUND", "Discount not found", 404);

    await tx.studentDiscount.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });

    await audit(tx, {
      tenantId,
      action: "soft_delete",
      entity: "student_discounts",
      entityId: existing.publicId,
      before: {
        student: student.name,
        feeHead: existing.feeHead?.name ?? null,
        type: existing.type,
        value: existing.value,
        reason: existing.reason,
      },
    });
  });

  return ok({ deleted: true });
});
