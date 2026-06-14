import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

/** GET /api/onboarding — get onboarding progress. */
export const GET = handler(async () => {
  const { tenantId } = await requireTenantSession();

  const progress = await withTenant(tenantId, async (tx) => {
    const tenant = await tx.tenant.findFirst({
      where: { id: tenantId },
      select: { settings: true },
    });

    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const onboarding = (settings.onboarding ?? {}) as Record<string, unknown>;

    // Check completion status of each step
    const [hasAcademicYear, studentCount, hasFeeStructure] = await Promise.all([
      tx.academicYear.count({ where: { tenantId } }),
      tx.student.count({ where: { tenantId, deletedAt: null } }),
      tx.feeStructure.count({ where: { tenantId } }),
    ]);

    return {
      completed: !!onboarding.completed,
      currentStep: (onboarding.currentStep as number) ?? 0,
      steps: {
        schoolInfo: true, // Already done at creation
        academicYear: hasAcademicYear > 0,
        students: studentCount > 0,
        fees: hasFeeStructure > 0,
        done: !!onboarding.completed,
      },
      counts: {
        academicYears: hasAcademicYear,
        students: studentCount,
        feeStructures: hasFeeStructure,
      },
    };
  });

  return ok(progress);
});

const UpdateOnboardingSchema = z.object({
  currentStep: z.number().int().min(0).max(4).optional(),
  completed: z.boolean().optional(),
});

/** PATCH /api/onboarding — update onboarding progress. */
export const PATCH = handler(async (req: Request) => {
  const { session, tenantId } = await requireTenantWrite();
  const body = await parseBody(req, UpdateOnboardingSchema);

  const result = await withTenant(tenantId, async (tx) => {
    const tenant = await tx.tenant.findFirst({
      where: { id: tenantId },
      select: { settings: true, publicId: true },
    });

    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const onboarding = { ...((settings.onboarding ?? {}) as Record<string, unknown>) };

    if (body.currentStep !== undefined) onboarding.currentStep = body.currentStep;
    if (body.completed !== undefined) onboarding.completed = body.completed;

    await tx.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...settings, onboarding } as Prisma.InputJsonValue },
    });

    if (body.completed) {
      await audit(tx, {
        tenantId,
        // actorId not passed — session.sub is UUID, not BigInt
        action: "update",
        entity: "tenants",
        entityId: tenant?.publicId,
        after: { onboardingCompleted: true },
        reason: "Onboarding wizard completed",
      });
    }

    return onboarding;
  });

  return ok(result);
});
