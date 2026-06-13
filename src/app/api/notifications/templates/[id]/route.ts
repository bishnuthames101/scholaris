import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  nameNe: z.string().nullable().optional(),
  bodyEn: z.string().min(1).optional(),
  bodyNe: z.string().nullable().optional(),
  variables: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const { tenantId } = await requireTenantSession();

  const template = await withTenant(tenantId, (tx) =>
    tx.notificationTemplate.findFirst({
      where: { tenantId, publicId: id, deletedAt: null },
    }),
  );
  if (!template) throw new ApiError("NOT_FOUND", "Template not found", 404);
  return ok(template);
});

export const PATCH = handler(async (req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const { tenantId, session } = await requireTenantWrite();
  const body = await parseBody(req, updateSchema);

  const template = await withTenant(tenantId, async (tx) => {
    const existing = await tx.notificationTemplate.findFirst({
      where: { tenantId, publicId: id, deletedAt: null },
    });
    if (!existing) throw new ApiError("NOT_FOUND", "Template not found", 404);

    const updated = await tx.notificationTemplate.update({
      where: { id: existing.id },
      data: {
        name: body.name,
        nameNe: body.nameNe,
        bodyEn: body.bodyEn,
        bodyNe: body.bodyNe,
        variables: body.variables,
        isActive: body.isActive,
      },
    });
    await audit(tx, {
      tenantId,
      action: "update",
      entity: "notification_templates",
      entityId: id,
      before: existing,
      after: updated,
    });
    return updated;
  });

  return ok(template);
});

export const DELETE = handler(async (_req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const { tenantId } = await requireTenantWrite();

  await withTenant(tenantId, async (tx) => {
    const existing = await tx.notificationTemplate.findFirst({
      where: { tenantId, publicId: id, deletedAt: null },
    });
    if (!existing) throw new ApiError("NOT_FOUND", "Template not found", 404);
    if (existing.isSystem)
      throw new ApiError("SYSTEM_TEMPLATE", "System templates cannot be deleted", 400);

    await tx.notificationTemplate.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    await audit(tx, {
      tenantId,
      action: "soft_delete",
      entity: "notification_templates",
      entityId: id,
    });
  });

  return ok({ deleted: true });
});
