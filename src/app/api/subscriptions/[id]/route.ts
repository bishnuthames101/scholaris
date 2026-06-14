import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireSession } from "@/lib/auth/session";

const UpdateSubscriptionSchema = z.object({
  planPublicId: z.string().uuid().optional(),
  billing: z.enum(["monthly", "annual"]).optional(),
  status: z.enum(["trial", "active", "past_due", "cancelled", "expired"]).optional(),
  trialEndsAt: z.string().datetime().optional(),
  extend: z.number().int().min(1).optional(), // extend current period by N days
});

type RouteParams = { params: Promise<{ id: string }> };

/** PATCH /api/subscriptions/:id — superadmin updates a subscription. */
export const PATCH = handler(async (req: Request, ctx: RouteParams) => {
  const session = await requireSession();
  if (!session.superadmin)
    throw new ApiError("FORBIDDEN", "Only superadmin can modify subscriptions", 403);

  const { id } = await ctx.params;
  const body = await parseBody(req, UpdateSubscriptionSchema);

  const sub = await withTenant(
    null,
    async (tx) => {
      const existing = await tx.subscription.findFirst({
        where: { publicId: id },
        include: { plan: true, tenant: true },
      });
      if (!existing) throw new ApiError("NOT_FOUND", "Subscription not found", 404);

      const updateData: Prisma.SubscriptionUncheckedUpdateInput = {};

      // Change plan
      if (body.planPublicId) {
        const newPlan = await tx.plan.findFirst({
          where: { publicId: body.planPublicId, deletedAt: null, isActive: true },
        });
        if (!newPlan) throw new ApiError("NOT_FOUND", "Plan not found", 404);
        updateData.planId = newPlan.id;
      }

      if (body.billing) updateData.billing = body.billing;
      if (body.status) {
        updateData.status = body.status;
        if (body.status === "cancelled") updateData.cancelledAt = new Date();

        // Sync tenant status
        const tenantStatus =
          body.status === "active" ? "active"
          : body.status === "trial" ? "trial"
          : body.status === "past_due" ? "active" // keep access, flag for follow-up
          : body.status === "cancelled" || body.status === "expired" ? "suspended"
          : undefined;

        if (tenantStatus) {
          await tx.tenant.update({
            where: { id: existing.tenantId },
            data: { status: tenantStatus },
          });
        }
      }

      if (body.trialEndsAt) updateData.trialEndsAt = new Date(body.trialEndsAt);
      if (body.extend) {
        updateData.currentPeriodEnd = new Date(
          existing.currentPeriodEnd.getTime() + body.extend * 86400000,
        );
      }

      // Refresh usage counts
      const [studentCount, staffCount] = await Promise.all([
        tx.student.count({ where: { tenantId: existing.tenantId, deletedAt: null } }),
        tx.staff.count({ where: { tenantId: existing.tenantId, deletedAt: null } }),
      ]);
      updateData.currentStudents = studentCount;
      updateData.currentStaff = staffCount;

      const updated = await tx.subscription.update({
        where: { id: existing.id },
        data: updateData,
        include: { plan: true, tenant: true },
      });

      await audit(tx, {
        tenantId: existing.tenantId,
        action: "update",
        entity: "subscriptions",
        entityId: existing.publicId,
        before: { plan: existing.plan.name, status: existing.status },
        after: body,
        reason: "Subscription updated by superadmin",
      });

      return updated;
    },
    { superadmin: true },
  );

  return ok(sub);
});

/** GET /api/subscriptions/:id — superadmin gets a single subscription. */
export const GET = handler(async (_req: Request, ctx: RouteParams) => {
  const session = await requireSession();
  if (!session.superadmin)
    throw new ApiError("FORBIDDEN", "Only superadmin can view subscriptions", 403);

  const { id } = await ctx.params;

  const sub = await withTenant(
    null,
    (tx) =>
      tx.subscription.findFirst({
        where: { publicId: id },
        include: {
          plan: true,
          tenant: { select: { publicId: true, name: true, slug: true, status: true } },
          invoices: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      }),
    { superadmin: true },
  );

  if (!sub) throw new ApiError("NOT_FOUND", "Subscription not found", 404);
  return ok(sub);
});
