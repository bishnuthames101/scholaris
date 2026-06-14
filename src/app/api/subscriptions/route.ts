import { z } from "zod";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireSession } from "@/lib/auth/session";
import { requireTenantSession, pagination } from "@/lib/tenant";

const AssignSubscriptionSchema = z.object({
  tenantPublicId: z.string().uuid(),
  planPublicId: z.string().uuid(),
  billing: z.enum(["monthly", "annual"]).default("monthly"),
  trialDays: z.number().int().min(0).optional(),
});

/** POST /api/subscriptions — superadmin assigns a plan to a school. */
export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  if (!session.superadmin)
    throw new ApiError("FORBIDDEN", "Only superadmin can assign subscriptions", 403);

  const body = await parseBody(req, AssignSubscriptionSchema);

  const result = await withTenant(
    null,
    async (tx) => {
      const tenant = await tx.tenant.findFirst({
        where: { publicId: body.tenantPublicId, deletedAt: null },
      });
      if (!tenant) throw new ApiError("NOT_FOUND", "School not found", 404);

      const plan = await tx.plan.findFirst({
        where: { publicId: body.planPublicId, deletedAt: null, isActive: true },
      });
      if (!plan) throw new ApiError("NOT_FOUND", "Plan not found", 404);

      // Check for existing subscription
      const existing = await tx.subscription.findUnique({ where: { tenantId: tenant.id } });
      if (existing)
        throw new ApiError(
          "ALREADY_SUBSCRIBED",
          "This school already has a subscription. Use PATCH to change it.",
          409,
        );

      const now = new Date();
      const trialDays = body.trialDays ?? plan.trialDays;
      const trialEndsAt = trialDays > 0 ? new Date(now.getTime() + trialDays * 86400000) : null;

      // Period: trial end or 1 month/1 year from now
      const periodEnd = trialEndsAt
        ? trialEndsAt
        : body.billing === "annual"
          ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
          : new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

      // Count current students & staff
      const [studentCount, staffCount] = await Promise.all([
        tx.student.count({ where: { tenantId: tenant.id, deletedAt: null } }),
        tx.staff.count({ where: { tenantId: tenant.id, deletedAt: null } }),
      ]);

      const sub = await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: trialDays > 0 ? "trial" : "active",
          billing: body.billing,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          trialEndsAt,
          currentStudents: studentCount,
          currentStaff: staffCount,
        },
        include: { plan: true, tenant: true },
      });

      // Update tenant status to match
      await tx.tenant.update({
        where: { id: tenant.id },
        data: { status: trialDays > 0 ? "trial" : "active" },
      });

      await audit(tx, {
        tenantId: tenant.id,
        action: "create",
        entity: "subscriptions",
        entityId: sub.publicId,
        after: { plan: plan.name, billing: body.billing, trial: trialDays > 0 },
        reason: "Subscription assigned by superadmin",
      });

      return sub;
    },
    { superadmin: true },
  );

  return created(result);
});

/** GET /api/subscriptions — superadmin lists all, school admin sees their own. */
export const GET = handler(async (req: Request) => {
  const session = await requireSession();
  const url = new URL(req.url);

  if (session.superadmin) {
    const { page, pageSize, skip } = pagination(url);
    const rawStatus = url.searchParams.get("status");
    const VALID_STATUSES = ["trial", "active", "past_due", "cancelled", "expired"];
    if (rawStatus && !VALID_STATUSES.includes(rawStatus))
      throw new ApiError("INVALID_STATUS", "Invalid status filter", 400);
    const statusFilter = rawStatus as "trial" | "active" | "past_due" | "cancelled" | "expired" | null;
    const search = url.searchParams.get("q")?.slice(0, 100) ?? null;

    const where = {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search
        ? { tenant: { name: { contains: search, mode: "insensitive" as const } } }
        : {}),
    };

    const [subscriptions, total] = await withTenant(
      null,
      (tx) =>
        Promise.all([
          tx.subscription.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { createdAt: "desc" },
            include: {
              plan: true,
              tenant: { select: { publicId: true, name: true, slug: true, status: true } },
            },
          }),
          tx.subscription.count({ where }),
        ]),
      { superadmin: true },
    );

    return ok(subscriptions, { page, pageSize, total });
  }

  // School admin: own subscription only
  const { tenantId } = await requireTenantSession();

  const sub = await withTenant(tenantId, (tx) =>
    tx.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    }),
  );

  return ok(sub);
});
