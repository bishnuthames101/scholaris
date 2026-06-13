import { handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireTenantSession, pagination } from "@/lib/tenant";

export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);
  const status = url.searchParams.get("status"); // pending|sent|delivered|failed
  const channel = url.searchParams.get("channel"); // whatsapp|sms|viber|push
  const triggerType = url.searchParams.get("triggerType"); // attendance.absent|bulk|...
  const search = url.searchParams.get("search"); // phone or name

  const where: Record<string, unknown> = { tenantId };
  if (status) where.status = status;
  if (channel) where.channel = channel;
  if (triggerType) where.triggerType = triggerType;
  if (search) {
    where.OR = [
      { recipientPhone: { contains: search } },
      { recipientName: { contains: search, mode: "insensitive" } },
    ];
  }

  const result = await withTenant(tenantId, async (tx) => {
    const [items, total] = await Promise.all([
      tx.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          publicId: true,
          recipientPhone: true,
          recipientName: true,
          channel: true,
          status: true,
          subject: true,
          bodyEn: true,
          bodyNe: true,
          triggerType: true,
          sentAt: true,
          deliveredAt: true,
          failedAt: true,
          errorMessage: true,
          retryCount: true,
          costPaisa: true,
          createdAt: true,
          template: { select: { publicId: true, name: true, slug: true } },
        },
      }),
      tx.notification.count({ where }),
    ]);
    return { items, total };
  });

  return ok(result.items, { page, pageSize, total: result.total });
});
