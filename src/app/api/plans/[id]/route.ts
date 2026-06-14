import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireSession } from "@/lib/auth/session";

const UpdatePlanSchema = z.object({
  name: z.string().min(2).optional(),
  nameNe: z.string().optional(),
  description: z.string().optional(),
  descriptionNe: z.string().optional(),
  monthlyPricePaisa: z.number().int().min(0).optional(),
  annualPricePaisa: z.number().int().min(0).optional(),
  maxStudents: z.number().int().min(1).optional(),
  maxStaff: z.number().int().min(1).optional(),
  maxMessagesPerMonth: z.number().int().min(0).optional(),
  includedCredits: z.number().int().min(0).optional(),
  modules: z.array(z.string()).min(1).optional(),
  features: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  trialDays: z.number().int().min(0).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/plans/:id — get a single plan. */
export const GET = handler(async (_req: Request, ctx: RouteParams) => {
  const session = await requireSession();
  const { id } = await ctx.params;

  const plan = await withTenant(
    null,
    (tx) =>
      tx.plan.findFirst({
        where: { publicId: id, deletedAt: null },
        include: { _count: { select: { subscriptions: true } } },
      }),
    { superadmin: true },
  );

  if (!plan) throw new ApiError("NOT_FOUND", "Plan not found", 404);
  if (!session.superadmin && !plan.isActive)
    throw new ApiError("NOT_FOUND", "Plan not found", 404);

  return ok(plan);
});

/** PATCH /api/plans/:id — superadmin updates a plan. */
export const PATCH = handler(async (req: Request, ctx: RouteParams) => {
  const session = await requireSession();
  if (!session.superadmin)
    throw new ApiError("FORBIDDEN", "Only superadmin can manage plans", 403);

  const { id } = await ctx.params;
  const body = await parseBody(req, UpdatePlanSchema);

  const plan = await withTenant(
    null,
    async (tx) => {
      const existing = await tx.plan.findFirst({
        where: { publicId: id, deletedAt: null },
      });
      if (!existing) throw new ApiError("NOT_FOUND", "Plan not found", 404);

      // If setting as default, unset others
      if (body.isDefault) {
        await tx.plan.updateMany({
          where: { isDefault: true, publicId: { not: id } },
          data: { isDefault: false },
        });
      }

      const data: Prisma.PlanUpdateInput = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.nameNe !== undefined) data.nameNe = body.nameNe;
      if (body.description !== undefined) data.description = body.description;
      if (body.descriptionNe !== undefined) data.descriptionNe = body.descriptionNe;
      if (body.monthlyPricePaisa !== undefined) data.monthlyPricePaisa = body.monthlyPricePaisa;
      if (body.annualPricePaisa !== undefined) data.annualPricePaisa = body.annualPricePaisa;
      if (body.maxStudents !== undefined) data.maxStudents = body.maxStudents;
      if (body.maxStaff !== undefined) data.maxStaff = body.maxStaff;
      if (body.maxMessagesPerMonth !== undefined) data.maxMessagesPerMonth = body.maxMessagesPerMonth;
      if (body.includedCredits !== undefined) data.includedCredits = body.includedCredits;
      if (body.modules !== undefined) data.modules = body.modules;
      if (body.features !== undefined) data.features = body.features as Prisma.InputJsonValue;
      if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
      if (body.isActive !== undefined) data.isActive = body.isActive;
      if (body.isDefault !== undefined) data.isDefault = body.isDefault;
      if (body.trialDays !== undefined) data.trialDays = body.trialDays;

      const updated = await tx.plan.update({
        where: { id: existing.id },
        data,
      });

      await audit(tx, {
        action: "update",
        entity: "plans",
        entityId: updated.publicId,
        before: { name: existing.name },
        after: body,
        reason: "Plan updated by superadmin",
      });

      return updated;
    },
    { superadmin: true },
  );

  return ok(plan);
});

/** DELETE /api/plans/:id — superadmin soft-deletes a plan. */
export const DELETE = handler(async (_req: Request, ctx: RouteParams) => {
  const session = await requireSession();
  if (!session.superadmin)
    throw new ApiError("FORBIDDEN", "Only superadmin can manage plans", 403);

  const { id } = await ctx.params;

  await withTenant(
    null,
    async (tx) => {
      const existing = await tx.plan.findFirst({
        where: { publicId: id, deletedAt: null },
        include: { _count: { select: { subscriptions: true } } },
      });
      if (!existing) throw new ApiError("NOT_FOUND", "Plan not found", 404);
      if (existing._count.subscriptions > 0)
        throw new ApiError(
          "PLAN_IN_USE",
          "Cannot delete a plan with active subscriptions. Deactivate it instead.",
          409,
        );

      await tx.plan.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), isActive: false },
      });

      await audit(tx, {
        action: "soft_delete",
        entity: "plans",
        entityId: existing.publicId,
        before: { name: existing.name },
      });
    },
    { superadmin: true },
  );

  return ok({ deleted: true });
});
