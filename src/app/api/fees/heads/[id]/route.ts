import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

const FEE_ROLES = ["school_admin", "principal", "accountant"];

type Ctx = { params: Promise<{ id: string }> };

function parseId(id: string): string {
  const r = z.uuid().safeParse(id);
  if (!r.success) throw new ApiError("NOT_FOUND", "Fee head not found", 404);
  return r.data;
}

const UpdateHeadSchema = z
  .object({
    name: z.string().min(1).max(80),
    nameNe: z.string().max(80).nullable(),
    sortOrder: z.number().int().min(0).max(999),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });

/** PATCH /api/fees/heads/[id] — update name/nameNe/sortOrder. */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite(FEE_ROLES);
  const id = parseId((await ctx.params).id);
  const body = await parseBody(req, UpdateHeadSchema);

  const updated = await withTenant(tenantId, async (tx) => {
    const existing = await tx.feeHead.findFirst({
      where: { tenantId, publicId: id, deletedAt: null },
    });
    if (!existing) throw new ApiError("NOT_FOUND", "Fee head not found", 404);

    if (body.name !== undefined && body.name !== existing.name) {
      const dup = await tx.feeHead.findFirst({
        where: { tenantId, name: body.name, deletedAt: null, id: { not: existing.id } },
        select: { id: true },
      });
      if (dup) throw new ApiError("DUPLICATE", "A fee head with this name already exists", 409);
    }

    const keys = Object.keys(body) as (keyof typeof body)[];
    const before = Object.fromEntries(keys.map((k) => [k, existing[k]]));

    let row;
    try {
      row = await tx.feeHead.update({ where: { id: existing.id }, data: body });
    } catch (err) {
      // Race with the pre-check, or a soft-deleted head holding the unique
      // (tenant_id, name) slot.
      if (err && typeof err === "object" && (err as { code?: string }).code === "P2002")
        throw new ApiError("DUPLICATE", "A fee head with this name already exists", 409);
      throw err;
    }
    const after = Object.fromEntries(keys.map((k) => [k, row[k]]));

    await audit(tx, {
      tenantId,
      action: "update",
      entity: "fee_heads",
      entityId: row.publicId,
      before,
      after,
    });

    return row;
  });

  return ok(updated);
});

/** DELETE /api/fees/heads/[id] — soft delete head + its fee structures. */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite(FEE_ROLES);
  const id = parseId((await ctx.params).id);

  await withTenant(tenantId, async (tx) => {
    const existing = await tx.feeHead.findFirst({
      where: { tenantId, publicId: id, deletedAt: null },
    });
    if (!existing) throw new ApiError("NOT_FOUND", "Fee head not found", 404);

    const now = new Date();
    await tx.feeHead.update({ where: { id: existing.id }, data: { deletedAt: now } });
    await tx.feeStructure.updateMany({
      where: { tenantId, feeHeadId: existing.id, deletedAt: null },
      data: { deletedAt: now },
    });

    await audit(tx, {
      tenantId,
      action: "soft_delete",
      entity: "fee_heads",
      entityId: existing.publicId,
      before: { name: existing.name, nameNe: existing.nameNe, sortOrder: existing.sortOrder },
    });
  });

  return ok({ deleted: true });
});
