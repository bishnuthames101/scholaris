import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  nameNe: z.string().nullable().optional(),
  filter: z.record(z.string(), z.unknown()).optional(),
});

type Params = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const { tenantId } = await requireTenantSession();

  const group = await withTenant(tenantId, (tx) =>
    tx.contactGroup.findFirst({
      where: { tenantId, publicId: id, deletedAt: null },
      include: {
        members: true,
        _count: { select: { members: true } },
      },
    }),
  );
  if (!group) throw new ApiError("NOT_FOUND", "Contact group not found", 404);
  return ok(group);
});

export const PATCH = handler(async (req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const { tenantId, session } = await requireTenantWrite();
  const body = await parseBody(req, updateSchema);

  const group = await withTenant(tenantId, async (tx) => {
    const existing = await tx.contactGroup.findFirst({
      where: { tenantId, publicId: id, deletedAt: null },
    });
    if (!existing) throw new ApiError("NOT_FOUND", "Contact group not found", 404);

    const updated = await tx.contactGroup.update({
      where: { id: existing.id },
      data: {
        name: body.name,
        nameNe: body.nameNe,
        filter: body.filter as Prisma.InputJsonValue,
      },
      include: { _count: { select: { members: true } } },
    });
    await audit(tx, {
      tenantId,
      action: "update",
      entity: "contact_groups",
      entityId: id,
      before: existing,
      after: updated,
    });
    return updated;
  });

  return ok(group);
});

export const DELETE = handler(async (_req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const { tenantId } = await requireTenantWrite();

  await withTenant(tenantId, async (tx) => {
    const existing = await tx.contactGroup.findFirst({
      where: { tenantId, publicId: id, deletedAt: null },
    });
    if (!existing) throw new ApiError("NOT_FOUND", "Contact group not found", 404);

    await tx.contactGroup.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    await audit(tx, {
      tenantId,
      action: "soft_delete",
      entity: "contact_groups",
      entityId: id,
    });
  });

  return ok({ deleted: true });
});
