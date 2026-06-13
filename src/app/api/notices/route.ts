import { z } from "zod";
import { handler, ok, created, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite, pagination } from "@/lib/tenant";

const CATEGORIES = ["general", "academic", "exam", "event", "holiday"] as const;

const createSchema = z.object({
  title: z.string().min(1).max(200),
  titleNe: z.string().max(200).optional(),
  body: z.string().min(1).max(5000),
  bodyNe: z.string().max(5000).optional(),
  category: z.enum(CATEGORIES).default("general"),
  audience: z.string().max(100).regex(/^(all|staff|parents|students|class:[0-9a-fA-F\-]{36}|section:[0-9a-fA-F\-]{36})$/).default("all"),
  isPinned: z.boolean().default(false),
  publishNow: z.boolean().default(true),
  expiresAt: z.string().datetime().optional(),
});

export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);
  const category = url.searchParams.get("category");
  const audience = url.searchParams.get("audience");

  const result = await withTenant(tenantId, async (tx) => {
    const where: Record<string, unknown> = { tenantId, deletedAt: null };
    if (category && CATEGORIES.includes(category as typeof CATEGORIES[number])) {
      where.category = category;
    }
    if (audience) where.audience = audience;

    const [items, total] = await Promise.all([
      tx.notice.findMany({
        where,
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
        include: {
          author: { select: { publicId: true, name: true } },
          _count: { select: { readReceipts: true } },
        },
      }),
      tx.notice.count({ where }),
    ]);
    return { items, total };
  });

  return ok(result.items, { page, pageSize, total: result.total });
});

export const POST = handler(async (req: Request) => {
  const { tenantId, session } = await requireTenantWrite(["school_admin", "principal", "teacher", "class_teacher"]);
  const body = await parseBody(req, createSchema);

  const notice = await withTenant(tenantId, async (tx) => {
    // Resolve author from session
    const user = await tx.user.findFirst({
      where: { publicId: session.sub },
      select: { id: true },
    });
    const staff = user
      ? await tx.staff.findFirst({ where: { tenantId, userId: user.id, deletedAt: null }, select: { id: true } })
      : null;

    // Fallback: use first active staff if user not linked
    const authorId = staff?.id ?? (await tx.staff.findFirst({ where: { tenantId, deletedAt: null }, select: { id: true } }))?.id;
    if (!authorId) throw new Error("No staff record found for author");

    const n = await tx.notice.create({
      data: {
        tenantId,
        authorId,
        title: body.title,
        titleNe: body.titleNe ?? null,
        body: body.body,
        bodyNe: body.bodyNe ?? null,
        category: body.category,
        audience: body.audience,
        isPinned: body.isPinned,
        publishedAt: body.publishNow ? new Date() : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
      include: {
        author: { select: { publicId: true, name: true } },
      },
    });

    // Emit domain event for notification delivery
    if (body.publishNow) {
      await tx.domainEvent.create({
        data: {
          tenantId,
          type: "notice.published",
          payload: {
            noticeId: n.publicId,
            title: n.title,
            audience: n.audience,
            category: n.category,
          },
        },
      });
    }

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "notices",
      entityId: n.publicId,
      after: { title: n.title, audience: n.audience, category: n.category },
    });

    return n;
  });

  return created(notice);
});
