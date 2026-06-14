import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireSession } from "@/lib/auth/session";

const CreatePlanSchema = z.object({
  name: z.string().min(2),
  nameNe: z.string().optional(),
  tier: z.enum(["free", "starter", "professional", "enterprise"]),
  description: z.string().optional(),
  descriptionNe: z.string().optional(),
  monthlyPricePaisa: z.number().int().min(0),
  annualPricePaisa: z.number().int().min(0),
  maxStudents: z.number().int().min(1).default(100),
  maxStaff: z.number().int().min(1).default(20),
  maxMessagesPerMonth: z.number().int().min(0).default(500),
  includedCredits: z.number().int().min(0).default(0),
  modules: z.array(z.string()).min(1),
  features: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  trialDays: z.number().int().min(0).default(30),
});

/** POST /api/plans — superadmin creates a plan. */
export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  if (!session.superadmin)
    throw new ApiError("FORBIDDEN", "Only superadmin can manage plans", 403);

  const body = await parseBody(req, CreatePlanSchema);

  const plan = await withTenant(
    null,
    async (tx) => {
      const existing = await tx.plan.findUnique({ where: { name: body.name } });
      if (existing) throw new ApiError("NAME_TAKEN", "A plan with this name already exists", 409);

      // If this plan is default, unset any existing default
      if (body.isDefault) {
        await tx.plan.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      const p = await tx.plan.create({
        data: {
          name: body.name,
          nameNe: body.nameNe,
          tier: body.tier,
          description: body.description,
          descriptionNe: body.descriptionNe,
          monthlyPricePaisa: body.monthlyPricePaisa,
          annualPricePaisa: body.annualPricePaisa,
          maxStudents: body.maxStudents,
          maxStaff: body.maxStaff,
          maxMessagesPerMonth: body.maxMessagesPerMonth,
          includedCredits: body.includedCredits,
          modules: body.modules,
          features: (body.features ?? {}) as Prisma.InputJsonValue,
          sortOrder: body.sortOrder ?? 0,
          isActive: body.isActive ?? true,
          isDefault: body.isDefault ?? false,
          trialDays: body.trialDays,
        },
      });

      await audit(tx, {
        action: "create",
        entity: "plans",
        entityId: p.publicId,
        after: { name: p.name, tier: p.tier },
        reason: "Plan created by superadmin",
      });

      return p;
    },
    { superadmin: true },
  );

  return created(plan);
});

/** GET /api/plans — list plans (superadmin sees all, others see active only). */
export const GET = handler(async () => {
  const session = await requireSession();

  const plans = await withTenant(
    null,
    (tx) =>
      tx.plan.findMany({
        where: {
          deletedAt: null,
          ...(session.superadmin ? {} : { isActive: true }),
        },
        orderBy: { sortOrder: "asc" },
        ...(session.superadmin
          ? { include: { _count: { select: { subscriptions: true } } } }
          : {}),
      }),
    { superadmin: true },
  );

  return ok(plans);
});
