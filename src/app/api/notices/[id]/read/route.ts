import { ApiError, handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireTenantSession } from "@/lib/tenant";

/** POST — mark a notice as read by the current user. */
export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { tenantId, session } = await requireTenantSession();
  const { id } = await params;

  await withTenant(tenantId, async (tx) => {
    const notice = await tx.notice.findFirst({
      where: { tenantId, publicId: id, deletedAt: null, publishedAt: { not: null } },
      select: { id: true },
    });
    if (!notice) throw new ApiError("NOT_FOUND", "Notice not found", 404);

    const user = await tx.user.findFirst({ where: { publicId: session.sub }, select: { id: true } });
    if (!user) throw new ApiError("USER_NOT_FOUND", "User not found", 404);

    await tx.noticeRead.upsert({
      where: { noticeId_userId: { noticeId: notice.id, userId: user.id } },
      update: {},
      create: { noticeId: notice.id, userId: user.id },
    });
  });

  return ok({ read: true });
});
