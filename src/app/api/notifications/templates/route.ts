import { z } from "zod";
import { handler, ok, created, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite, pagination } from "@/lib/tenant";
import { ensureSystemTemplates } from "@/lib/notifications";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  nameNe: z.string().optional(),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/),
  bodyEn: z.string().min(1),
  bodyNe: z.string().optional(),
  variables: z.array(z.string()).default([]),
});

export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);

  const result = await withTenant(tenantId, async (tx) => {
    await ensureSystemTemplates(tx as never, tenantId);
    const [items, total] = await Promise.all([
      tx.notificationTemplate.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        skip,
        take: pageSize,
      }),
      tx.notificationTemplate.count({ where: { tenantId, deletedAt: null } }),
    ]);
    return { items, total };
  });

  return ok(result.items, { page, pageSize, total: result.total });
});

export const POST = handler(async (req: Request) => {
  const { tenantId, session } = await requireTenantWrite();
  const body = await parseBody(req, createSchema);

  const template = await withTenant(tenantId, async (tx) => {
    const t = await tx.notificationTemplate.create({
      data: {
        tenantId,
        name: body.name,
        nameNe: body.nameNe ?? null,
        slug: body.slug,
        bodyEn: body.bodyEn,
        bodyNe: body.bodyNe ?? null,
        variables: body.variables,
        isSystem: false,
      },
    });
    await audit(tx, {
      tenantId,
      action: "create",
      entity: "notification_templates",
      entityId: t.publicId,
      after: body,
    });
    return t;
  });

  return created(template);
});
