import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db";
import { pagination } from "@/lib/tenant";

/**
 * GET /api/portal/notices — school notices visible to parents/students/teachers.
 * Shows all tenant-wide notices (non-deleted).
 */
export const GET = handler(async (req: Request) => {
  const session = await requireRole("parent", "student", "teacher", "class_teacher");
  if (!session.tenantDbId) return ok([]);
  const tenantId = BigInt(session.tenantDbId);
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);

  const result = await withTenant(tenantId, async (tx) => {
    const where = { tenantId, deletedAt: null };
    const [notices, total] = await Promise.all([
      tx.notification.findMany({
        where: { ...where, triggerType: { in: ["notice", "bulk"] } },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          publicId: true,
          subject: true,
          bodyEn: true,
          bodyNe: true,
          createdAt: true,
          triggerType: true,
        },
      }),
      tx.notification.count({ where: { ...where, triggerType: { in: ["notice", "bulk"] } } }),
    ]);
    return { notices, total };
  });

  return ok(result.notices, { page, pageSize, total: result.total });
});
