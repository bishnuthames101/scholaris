import { handler, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { withTenant } from "@/lib/db";

/**
 * GET /api/portal/me — return the current user's profile with linked entity
 * (guardian, student, or staff) for portal navigation.
 */
export const GET = handler(async () => {
  const session = await requireSession();
  if (!session.tenantDbId) return ok({ roles: session.roles, superadmin: session.superadmin });

  const tenantId = BigInt(session.tenantDbId);

  const profile = await withTenant(
    null,
    async (tx) => {
      const user = await tx.user.findFirst({
        where: { publicId: session.sub, deletedAt: null },
        select: { id: true, name: true, nameNe: true, email: true, phone: true, locale: true },
      });
      if (!user) return null;

      // Resolve linked entity
      let linkedEntity: { type: string; publicId: string; name: string } | null = null;

      if (session.roles.includes("parent")) {
        const g = await tx.guardian.findFirst({
          where: { tenantId, userId: user.id, deletedAt: null },
          select: { publicId: true, name: true },
        });
        if (g) linkedEntity = { type: "guardian", publicId: g.publicId, name: g.name };
      } else if (session.roles.includes("student")) {
        const s = await tx.student.findFirst({
          where: { tenantId, userId: user.id, deletedAt: null },
          select: { publicId: true, name: true },
        });
        if (s) linkedEntity = { type: "student", publicId: s.publicId, name: s.name };
      } else if (session.roles.includes("teacher") || session.roles.includes("class_teacher")) {
        const st = await tx.staff.findFirst({
          where: { tenantId, userId: user.id, deletedAt: null },
          select: { publicId: true, name: true },
        });
        if (st) linkedEntity = { type: "staff", publicId: st.publicId, name: st.name };
      }

      return { ...user, linkedEntity };
    },
    { superadmin: true },
  );

  return ok({
    roles: session.roles,
    superadmin: session.superadmin,
    profile,
  });
});
