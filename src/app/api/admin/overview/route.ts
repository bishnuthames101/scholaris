import { ApiError, handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";

/** GET /api/admin/overview — superadmin platform metrics. */
export const GET = handler(async () => {
  const session = await requireSession();
  if (!session.superadmin)
    throw new ApiError("FORBIDDEN", "Superadmin only", 403);

  const overview = await withTenant(
    null,
    async (tx) => {
      // Tenant counts
      const [totalSchools, activeSchools, trialSchools, suspendedSchools] =
        await Promise.all([
          tx.tenant.count({ where: { deletedAt: null } }),
          tx.tenant.count({ where: { status: "active", deletedAt: null } }),
          tx.tenant.count({ where: { status: "trial", deletedAt: null } }),
          tx.tenant.count({ where: { status: "suspended", deletedAt: null } }),
        ]);

      // Subscription counts
      const [totalSubscriptions, activeSubscriptions] = await Promise.all([
        tx.subscription.count(),
        tx.subscription.count({ where: { status: { in: ["active", "trial"] } } }),
      ]);

      // MRR calculation: sum monthly price of active subscriptions
      const activeSubs = await tx.subscription.findMany({
        where: { status: { in: ["active", "trial"] } },
        include: { plan: true },
      });

      let mrrPaisa = 0;
      for (const sub of activeSubs) {
        if (sub.billing === "annual") {
          // Annual: divide by 12 for monthly equivalent
          mrrPaisa += Math.round(sub.plan.annualPricePaisa / 12);
        } else {
          mrrPaisa += sub.plan.monthlyPricePaisa;
        }
      }

      // Platform-wide usage
      const [totalStudents, totalStaff, totalUsers] = await Promise.all([
        tx.student.count({ where: { deletedAt: null } }),
        tx.staff.count({ where: { deletedAt: null } }),
        tx.user.count({ where: { deletedAt: null } }),
      ]);

      // Message usage (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
      const recentMessages = await tx.notification.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      });

      // Recent signups (last 30 days)
      const recentSignups = await tx.tenant.count({
        where: { createdAt: { gte: thirtyDaysAgo }, deletedAt: null },
      });

      // Plan distribution
      const planDistribution = await tx.subscription.groupBy({
        by: ["planId"],
        _count: true,
      });

      const plans = await tx.plan.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, tier: true },
      });

      const planMap = new Map(plans.map((p) => [p.id.toString(), p]));
      const distribution = planDistribution.map((pd) => ({
        plan: planMap.get(pd.planId.toString())?.name ?? "Unknown",
        tier: planMap.get(pd.planId.toString())?.tier ?? "unknown",
        count: pd._count,
      }));

      return {
        schools: { total: totalSchools, active: activeSchools, trial: trialSchools, suspended: suspendedSchools },
        subscriptions: { total: totalSubscriptions, active: activeSubscriptions },
        revenue: { mrrPaisa },
        usage: { students: totalStudents, staff: totalStaff, users: totalUsers, messagesLast30d: recentMessages },
        growth: { signupsLast30d: recentSignups },
        planDistribution: distribution,
      };
    },
    { superadmin: true },
  );

  return ok(overview);
});
