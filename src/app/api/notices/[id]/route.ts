import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  titleNe: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(5000).optional(),
  bodyNe: z.string().max(5000).nullable().optional(),
  category: z.enum(["general", "academic", "exam", "event", "holiday"]).optional(),
  audience: z.string().max(100).optional(),
  isPinned: z.boolean().optional(),
  publish: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { tenantId } = await requireTenantSession();
  const { id } = await params;

  const notice = await withTenant(tenantId, (tx) =>
    tx.notice.findFirst({
      where: { tenantId, publicId: id, deletedAt: null },
      include: {
        author: { select: { publicId: true, name: true, nameNe: true } },
        _count: { select: { readReceipts: true } },
      },
    }),
  );
  if (!notice) throw new ApiError("NOT_FOUND", "Notice not found", 404);

  return ok(notice);
});

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { tenantId } = await requireTenantWrite(["school_admin", "principal", "teacher", "class_teacher"]);
  const { id } = await params;
  const body = await parseBody(req, updateSchema);

  const notice = await withTenant(tenantId, async (tx) => {
    const existing = await tx.notice.findFirst({ where: { tenantId, publicId: id, deletedAt: null }, select: { id: true, publishedAt: true } });
    if (!existing) throw new ApiError("NOT_FOUND", "Notice not found", 404);

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.titleNe !== undefined) data.titleNe = body.titleNe;
    if (body.body !== undefined) data.body = body.body;
    if (body.bodyNe !== undefined) data.bodyNe = body.bodyNe;
    if (body.category !== undefined) data.category = body.category;
    if (body.audience !== undefined) data.audience = body.audience;
    if (body.isPinned !== undefined) data.isPinned = body.isPinned;
    if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    // Publish
    if (body.publish && !existing.publishedAt) {
      data.publishedAt = new Date();
      await tx.domainEvent.create({
        data: {
          tenantId,
          type: "notice.published",
          payload: { noticeId: id, title: body.title ?? "" },
        },
      });
    }

    const updated = await tx.notice.update({
      where: { id: existing.id },
      data,
      include: { author: { select: { publicId: true, name: true } } },
    });

    await audit(tx, { tenantId, action: "update", entity: "notices", entityId: id, after: body });

    return updated;
  });

  return ok(notice);
});

export const DELETE = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { tenantId } = await requireTenantWrite(["school_admin", "principal"]);
  const { id } = await params;

  await withTenant(tenantId, async (tx) => {
    const existing = await tx.notice.findFirst({ where: { tenantId, publicId: id, deletedAt: null }, select: { id: true } });
    if (!existing) throw new ApiError("NOT_FOUND", "Notice not found", 404);

    await tx.notice.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await audit(tx, { tenantId, action: "soft_delete", entity: "notices", entityId: id });
  });

  return ok({ deleted: true });
});
