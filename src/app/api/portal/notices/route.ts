import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db";
import { pagination } from "@/lib/tenant";

/**
 * GET /api/portal/notices — school notices visible to parents/students/teachers.
 * Filters by audience and shows only published, non-expired notices.
 */
export const GET = handler(async (req: Request) => {
  const session = await requireRole("parent", "student", "teacher", "class_teacher");
  if (!session.tenantDbId) return ok([]);
  const tenantId = BigInt(session.tenantDbId);
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);

  // Determine which audience tags the user matches
  const audienceFilter = ["all"];
  if (session.roles.includes("parent")) audienceFilter.push("parents");
  if (session.roles.includes("student")) audienceFilter.push("students");
  if (session.roles.includes("teacher") || session.roles.includes("class_teacher")) audienceFilter.push("staff");

  const result = await withTenant(tenantId, async (tx) => {
    const now = new Date();
    const where = {
      tenantId,
      deletedAt: null,
      publishedAt: { not: null, lte: now },
      OR: [
        { audience: { in: audienceFilter } },
        { audience: { startsWith: "class:" } },
        { audience: { startsWith: "section:" } },
      ],
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    };

    const [notices, total] = await Promise.all([
      tx.notice.findMany({
        where,
        orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
        skip,
        take: pageSize,
        select: {
          publicId: true,
          title: true,
          titleNe: true,
          body: true,
          bodyNe: true,
          category: true,
          audience: true,
          isPinned: true,
          publishedAt: true,
          author: { select: { name: true } },
        },
      }),
      tx.notice.count({ where }),
    ]);
    return { notices, total };
  });

  return ok(result.notices, { page, pageSize, total: result.total });
});
