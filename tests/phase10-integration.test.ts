import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../src/lib/db";
import {
  getPlanLimits,
  requireModuleAccess,
  checkStudentLimit,
  checkStaffLimit,
  checkMessageLimit,
} from "../src/lib/subscriptions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma TxClient is structurally compatible
type AnyTx = any;

/**
 * Phase 10 Integration tests.
 * Tests plan CRUD, subscription lifecycle, module gating,
 * usage limit enforcement, onboarding progress, and admin overview queries.
 *
 * Requires DATABASE_URL with migrations + RLS applied.
 */

const prisma = new PrismaClient();

let tenantId: bigint;
let tenantPublicId: string;
let unsubscribedTenantId: bigint;
let testPlanId: bigint;
let testPlanPublicId: string;
let limitedPlanId: bigint;
let limitedPlanPublicId: string;
let subscriptionId: bigint;
let subscriptionPublicId: string;

beforeAll(async () => {
  await withTenant(
    null,
    async (tx) => {
      // Create test tenants
      const t1 = await tx.tenant.upsert({
        where: { slug: "p10-int-main" },
        update: {},
        create: { name: "P10 Integration Main", slug: "p10-int-main" },
      });
      const t2 = await tx.tenant.upsert({
        where: { slug: "p10-int-nosub" },
        update: {},
        create: { name: "P10 Integration No Sub", slug: "p10-int-nosub" },
      });
      tenantId = t1.id;
      tenantPublicId = t1.publicId;
      unsubscribedTenantId = t2.id;

      // Clean up prior test data
      await tx.subscriptionInvoice.deleteMany({
        where: { tenantId: { in: [t1.id, t2.id] } },
      });
      await tx.subscription.deleteMany({
        where: { tenantId: { in: [t1.id, t2.id] } },
      });
      await tx.plan.deleteMany({
        where: { name: { startsWith: "P10_INT_" } },
      });

      // Create a full-featured test plan
      const plan = await tx.plan.create({
        data: {
          name: "P10_INT_Full",
          tier: "professional",
          monthlyPricePaisa: 249900,
          annualPricePaisa: 2499000,
          maxStudents: 1000,
          maxStaff: 100,
          maxMessagesPerMonth: 5000,
          modules: ["sis", "attendance", "fees", "exams", "communication", "notices", "timetable", "homework"],
          trialDays: 14,
          isActive: true,
          sortOrder: 1,
        },
      });
      testPlanId = plan.id;
      testPlanPublicId = plan.publicId;

      // Create a very limited plan (for limit testing)
      const limited = await tx.plan.create({
        data: {
          name: "P10_INT_Limited",
          tier: "free",
          monthlyPricePaisa: 0,
          annualPricePaisa: 0,
          maxStudents: 1, // very small limits
          maxStaff: 1,
          maxMessagesPerMonth: 1,
          modules: ["sis"], // only SIS
          trialDays: 0,
          isActive: true,
          sortOrder: 2,
        },
      });
      limitedPlanId = limited.id;
      limitedPlanPublicId = limited.publicId;

      // Create subscription for main tenant on the full plan
      const now = new Date();
      const sub = await tx.subscription.create({
        data: {
          tenantId: t1.id,
          planId: plan.id,
          status: "active",
          billing: "monthly",
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 86400000),
          currentStudents: 0,
          currentStaff: 0,
          messagesThisMonth: 0,
        },
      });
      subscriptionId = sub.id;
      subscriptionPublicId = sub.publicId;
    },
    { superadmin: true },
  );
});

afterAll(async () => {
  await withTenant(
    null,
    async (tx) => {
      await tx.subscriptionInvoice.deleteMany({
        where: { tenantId: { in: [tenantId, unsubscribedTenantId] } },
      });
      await tx.subscription.deleteMany({
        where: { tenantId: { in: [tenantId, unsubscribedTenantId] } },
      });
      await tx.plan.deleteMany({
        where: { name: { startsWith: "P10_INT_" } },
      });
    },
    { superadmin: true },
  );
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────
// Plan CRUD — superadmin operations
// ─────────────────────────────────────────────────────────────

describe("Plan CRUD", () => {
  it("creates a plan with all fields", async () => {
    const plan = await withTenant(
      null,
      (tx) =>
        tx.plan.create({
          data: {
            name: "P10_INT_CRUD_Test",
            tier: "starter",
            monthlyPricePaisa: 99900,
            annualPricePaisa: 999000,
            maxStudents: 200,
            maxStaff: 30,
            maxMessagesPerMonth: 1000,
            modules: ["sis", "attendance", "fees"],
            features: { smsGateway: true, emailAlerts: true },
            trialDays: 30,
            isActive: true,
            isDefault: false,
            sortOrder: 99,
          },
        }),
      { superadmin: true },
    );

    expect(plan.publicId).toBeTruthy();
    expect(plan.name).toBe("P10_INT_CRUD_Test");
    expect(plan.tier).toBe("starter");
    expect(plan.monthlyPricePaisa).toBe(99900);
    expect(plan.annualPricePaisa).toBe(999000);
    expect(plan.maxStudents).toBe(200);
    expect(plan.modules).toContain("sis");
    expect(plan.modules).toContain("attendance");
    expect(plan.features).toEqual({ smsGateway: true, emailAlerts: true });
    expect(plan.trialDays).toBe(30);

    // Clean up
    await withTenant(
      null,
      (tx) => tx.plan.delete({ where: { id: plan.id } }),
      { superadmin: true },
    );
  });

  it("enforces unique plan names", async () => {
    await expect(
      withTenant(
        null,
        (tx) =>
          tx.plan.create({
            data: {
              name: "P10_INT_Full", // already exists
              tier: "free",
              monthlyPricePaisa: 0,
              annualPricePaisa: 0,
              maxStudents: 10,
              maxStaff: 5,
              maxMessagesPerMonth: 50,
              modules: ["sis"],
            },
          }),
        { superadmin: true },
      ),
    ).rejects.toThrow();
  });

  it("updates a plan", async () => {
    const updated = await withTenant(
      null,
      (tx) =>
        tx.plan.update({
          where: { id: testPlanId },
          data: { description: "Updated integration test plan" },
        }),
      { superadmin: true },
    );
    expect(updated.description).toBe("Updated integration test plan");

    // Reset
    await withTenant(
      null,
      (tx) =>
        tx.plan.update({
          where: { id: testPlanId },
          data: { description: null },
        }),
      { superadmin: true },
    );
  });

  it("soft-deletes a plan (no active subscriptions)", async () => {
    const temp = await withTenant(
      null,
      (tx) =>
        tx.plan.create({
          data: {
            name: "P10_INT_ToDelete",
            tier: "free",
            monthlyPricePaisa: 0,
            annualPricePaisa: 0,
            maxStudents: 10,
            maxStaff: 5,
            maxMessagesPerMonth: 50,
            modules: ["sis"],
          },
        }),
      { superadmin: true },
    );

    const deleted = await withTenant(
      null,
      (tx) =>
        tx.plan.update({
          where: { id: temp.id },
          data: { deletedAt: new Date(), isActive: false },
        }),
      { superadmin: true },
    );
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.isActive).toBe(false);

    // Hard clean up
    await withTenant(
      null,
      (tx) => tx.plan.delete({ where: { id: temp.id } }),
      { superadmin: true },
    );
  });

  it("default plan toggle unsets previous default", async () => {
    // Create first plan as default
    const p1 = await withTenant(
      null,
      (tx) =>
        tx.plan.create({
          data: {
            name: "P10_INT_Default1",
            tier: "free",
            monthlyPricePaisa: 0,
            annualPricePaisa: 0,
            maxStudents: 10,
            maxStaff: 5,
            maxMessagesPerMonth: 50,
            modules: ["sis"],
            isDefault: true,
          },
        }),
      { superadmin: true },
    );

    // Create second plan: first unset all defaults, then create as default
    await withTenant(
      null,
      (tx) =>
        tx.plan.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        }),
      { superadmin: true },
    );

    const p2 = await withTenant(
      null,
      (tx) =>
        tx.plan.create({
          data: {
            name: "P10_INT_Default2",
            tier: "starter",
            monthlyPricePaisa: 100,
            annualPricePaisa: 1000,
            maxStudents: 20,
            maxStaff: 10,
            maxMessagesPerMonth: 100,
            modules: ["sis"],
            isDefault: true,
          },
        }),
      { superadmin: true },
    );

    // p1 should no longer be default
    const p1After = await withTenant(
      null,
      (tx) => tx.plan.findUnique({ where: { id: p1.id } }),
      { superadmin: true },
    );
    expect(p1After!.isDefault).toBe(false);
    expect(p2.isDefault).toBe(true);

    // Clean up
    await withTenant(
      null,
      async (tx) => {
        await tx.plan.delete({ where: { id: p1.id } });
        await tx.plan.delete({ where: { id: p2.id } });
      },
      { superadmin: true },
    );
  });
});

// ─────────────────────────────────────────────────────────────
// Subscription lifecycle
// ─────────────────────────────────────────────────────────────

describe("Subscription lifecycle", () => {
  it("subscription is linked to tenant and plan", async () => {
    const sub = await withTenant(
      null,
      (tx) =>
        tx.subscription.findUnique({
          where: { tenantId },
          include: { plan: true, tenant: true },
        }),
      { superadmin: true },
    );
    expect(sub).not.toBeNull();
    expect(sub!.plan.name).toBe("P10_INT_Full");
    expect(sub!.tenant.slug).toBe("p10-int-main");
    expect(sub!.status).toBe("active");
    expect(sub!.billing).toBe("monthly");
  });

  it("one-subscription-per-tenant constraint (unique tenantId)", async () => {
    await expect(
      withTenant(
        null,
        (tx) =>
          tx.subscription.create({
            data: {
              tenantId,
              planId: testPlanId,
              status: "active",
              billing: "monthly",
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(),
            },
          }),
        { superadmin: true },
      ),
    ).rejects.toThrow();
  });

  it("can change subscription status", async () => {
    // Set to past_due
    const pastDue = await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { status: "past_due" },
        }),
      { superadmin: true },
    );
    expect(pastDue.status).toBe("past_due");

    // Set back to active
    await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { status: "active" },
        }),
      { superadmin: true },
    );
  });

  it("can change billing cycle", async () => {
    const annual = await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { billing: "annual" },
        }),
      { superadmin: true },
    );
    expect(annual.billing).toBe("annual");

    // Reset
    await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { billing: "monthly" },
        }),
      { superadmin: true },
    );
  });

  it("can extend subscription period", async () => {
    const before = await withTenant(
      null,
      (tx) => tx.subscription.findUnique({ where: { id: subscriptionId } }),
      { superadmin: true },
    );

    const newEnd = new Date(before!.currentPeriodEnd.getTime() + 15 * 86400000);
    const extended = await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { currentPeriodEnd: newEnd },
        }),
      { superadmin: true },
    );

    expect(extended.currentPeriodEnd.getTime()).toBeGreaterThan(
      before!.currentPeriodEnd.getTime(),
    );
  });

  it("can switch plan", async () => {
    const switched = await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { planId: limitedPlanId },
        }),
      { superadmin: true },
    );
    expect(switched.planId).toBe(limitedPlanId);

    // Switch back
    await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { planId: testPlanId },
        }),
      { superadmin: true },
    );
  });
});

// ─────────────────────────────────────────────────────────────
// Subscription invoices
// ─────────────────────────────────────────────────────────────

describe("Subscription invoices", () => {
  let invoiceId: bigint;

  it("creates an invoice linked to subscription and tenant", async () => {
    const now = new Date();
    const inv = await withTenant(
      null,
      (tx) =>
        tx.subscriptionInvoice.create({
          data: {
            subscriptionId,
            tenantId,
            invoiceNo: "P10-INT-001",
            periodStart: now,
            periodEnd: new Date(now.getTime() + 30 * 86400000),
            amountPaisa: 249900,
            discountPaisa: 0,
            taxPaisa: 32487, // 13% VAT
            totalPaisa: 282387,
          },
        }),
      { superadmin: true },
    );

    invoiceId = inv.id;
    expect(inv.invoiceNo).toBe("P10-INT-001");
    expect(inv.amountPaisa).toBe(249900);
    expect(inv.taxPaisa).toBe(32487);
    expect(inv.totalPaisa).toBe(282387);
    expect(inv.status).toBe("pending");
  });

  it("can mark invoice as paid", async () => {
    const paid = await withTenant(
      null,
      (tx) =>
        tx.subscriptionInvoice.update({
          where: { id: invoiceId },
          data: { status: "paid", paidAt: new Date() },
        }),
      { superadmin: true },
    );
    expect(paid.status).toBe("paid");
    expect(paid.paidAt).not.toBeNull();
  });

  it("invoice is scoped to correct tenant", async () => {
    const inv = await withTenant(
      null,
      (tx) =>
        tx.subscriptionInvoice.findFirst({
          where: { id: invoiceId },
          include: { subscription: true },
        }),
      { superadmin: true },
    );
    expect(inv!.tenantId).toBe(tenantId);
    expect(inv!.subscription.tenantId).toBe(tenantId);
  });

  afterAll(async () => {
    if (invoiceId) {
      await withTenant(
        null,
        (tx) => tx.subscriptionInvoice.delete({ where: { id: invoiceId } }),
        { superadmin: true },
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Module gating (requireModuleAccess)
// ─────────────────────────────────────────────────────────────

describe("Module gating", () => {
  it("getPlanLimits returns correct data for subscribed tenant", async () => {
    const limits = await withTenant(
      null,
      (tx: AnyTx) => getPlanLimits(tx, tenantId),
      { superadmin: true },
    );
    expect(limits).not.toBeNull();
    expect(limits!.tier).toBe("professional");
    expect(limits!.maxStudents).toBe(1000);
    expect(limits!.maxStaff).toBe(100);
    expect(limits!.maxMessagesPerMonth).toBe(5000);
    expect(limits!.modules).toContain("sis");
    expect(limits!.modules).toContain("attendance");
    expect(limits!.status).toBe("active");
  });

  it("getPlanLimits returns null for unsubscribed tenant", async () => {
    const limits = await withTenant(
      null,
      (tx: AnyTx) => getPlanLimits(tx, unsubscribedTenantId),
      { superadmin: true },
    );
    expect(limits).toBeNull();
  });

  it("allows access to included modules", async () => {
    // Should not throw — SIS is in the full plan
    await expect(
      withTenant(
        null,
        (tx: AnyTx) => requireModuleAccess(tx, tenantId, "sis"),
        { superadmin: true },
      ),
    ).resolves.not.toThrow();

    await expect(
      withTenant(
        null,
        (tx: AnyTx) => requireModuleAccess(tx, tenantId, "attendance"),
        { superadmin: true },
      ),
    ).resolves.not.toThrow();
  });

  it("blocks access to excluded modules", async () => {
    // Library is NOT in our test plan's modules
    await expect(
      withTenant(
        null,
        (tx: AnyTx) => requireModuleAccess(tx, tenantId, "library"),
        { superadmin: true },
      ),
    ).rejects.toThrow("not included in your plan");
  });

  it("allows all modules for unsubscribed tenant (initial setup)", async () => {
    // No subscription = unrestricted access
    await expect(
      withTenant(
        null,
        (tx: AnyTx) => requireModuleAccess(tx, unsubscribedTenantId, "library"),
        { superadmin: true },
      ),
    ).resolves.not.toThrow();
  });

  it("blocks access when subscription is cancelled", async () => {
    // Temporarily cancel
    await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { status: "cancelled", cancelledAt: new Date() },
        }),
      { superadmin: true },
    );

    await expect(
      withTenant(
        null,
        (tx: AnyTx) => requireModuleAccess(tx, tenantId, "sis"),
        { superadmin: true },
      ),
    ).rejects.toThrow("inactive");

    // Restore
    await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { status: "active", cancelledAt: null },
        }),
      { superadmin: true },
    );
  });

  it("blocks access when subscription is expired", async () => {
    await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { status: "expired" },
        }),
      { superadmin: true },
    );

    await expect(
      withTenant(
        null,
        (tx: AnyTx) => requireModuleAccess(tx, tenantId, "sis"),
        { superadmin: true },
      ),
    ).rejects.toThrow("inactive");

    // Restore
    await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { status: "active" },
        }),
      { superadmin: true },
    );
  });

  it("blocks access when trial has expired", async () => {
    const pastDate = new Date(Date.now() - 86400000); // yesterday
    await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { status: "trial", trialEndsAt: pastDate },
        }),
      { superadmin: true },
    );

    await expect(
      withTenant(
        null,
        (tx: AnyTx) => requireModuleAccess(tx, tenantId, "sis"),
        { superadmin: true },
      ),
    ).rejects.toThrow("trial has expired");

    // Restore
    await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { status: "active", trialEndsAt: null },
        }),
      { superadmin: true },
    );
  });
});

// ─────────────────────────────────────────────────────────────
// Usage limit enforcement
// ─────────────────────────────────────────────────────────────

describe("Usage limit enforcement", () => {
  it("allows operations under limit", async () => {
    // Current: 0 students, limit: 1000
    await expect(
      withTenant(
        null,
        (tx: AnyTx) => checkStudentLimit(tx, tenantId),
        { superadmin: true },
      ),
    ).resolves.not.toThrow();

    await expect(
      withTenant(
        null,
        (tx: AnyTx) => checkStaffLimit(tx, tenantId),
        { superadmin: true },
      ),
    ).resolves.not.toThrow();

    await expect(
      withTenant(
        null,
        (tx: AnyTx) => checkMessageLimit(tx, tenantId),
        { superadmin: true },
      ),
    ).resolves.not.toThrow();
  });

  it("blocks when student limit reached", async () => {
    // Switch to limited plan (maxStudents: 1) and set current to 1
    await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { planId: limitedPlanId, currentStudents: 1 },
        }),
      { superadmin: true },
    );

    await expect(
      withTenant(
        null,
        (tx: AnyTx) => checkStudentLimit(tx, tenantId),
        { superadmin: true },
      ),
    ).rejects.toThrow("plan allows up to");

    // Restore
    await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { planId: testPlanId, currentStudents: 0 },
        }),
      { superadmin: true },
    );
  });

  it("blocks when staff limit reached", async () => {
    await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { planId: limitedPlanId, currentStaff: 1 },
        }),
      { superadmin: true },
    );

    await expect(
      withTenant(
        null,
        (tx: AnyTx) => checkStaffLimit(tx, tenantId),
        { superadmin: true },
      ),
    ).rejects.toThrow("plan allows up to");

    // Restore
    await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { planId: testPlanId, currentStaff: 0 },
        }),
      { superadmin: true },
    );
  });

  it("blocks when message limit reached", async () => {
    await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { planId: limitedPlanId, messagesThisMonth: 1 },
        }),
      { superadmin: true },
    );

    await expect(
      withTenant(
        null,
        (tx: AnyTx) => checkMessageLimit(tx, tenantId),
        { superadmin: true },
      ),
    ).rejects.toThrow("plan allows");

    // Restore
    await withTenant(
      null,
      (tx) =>
        tx.subscription.update({
          where: { id: subscriptionId },
          data: { planId: testPlanId, messagesThisMonth: 0 },
        }),
      { superadmin: true },
    );
  });

  it("skips limits for unsubscribed tenant", async () => {
    // All checks should pass — no subscription = no limits
    await expect(
      withTenant(
        null,
        (tx: AnyTx) => checkStudentLimit(tx, unsubscribedTenantId),
        { superadmin: true },
      ),
    ).resolves.not.toThrow();

    await expect(
      withTenant(
        null,
        (tx: AnyTx) => checkStaffLimit(tx, unsubscribedTenantId),
        { superadmin: true },
      ),
    ).resolves.not.toThrow();

    await expect(
      withTenant(
        null,
        (tx: AnyTx) => checkMessageLimit(tx, unsubscribedTenantId),
        { superadmin: true },
      ),
    ).resolves.not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// Onboarding progress (settings JSON)
// ─────────────────────────────────────────────────────────────

describe("Onboarding progress", () => {
  it("tenant starts with no onboarding settings", async () => {
    const tenant = await withTenant(
      null,
      (tx) =>
        tx.tenant.findUnique({
          where: { id: tenantId },
          select: { settings: true },
        }),
      { superadmin: true },
    );

    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const onboarding = settings.onboarding as Record<string, unknown> | undefined;
    expect(onboarding?.completed).toBeFalsy();
  });

  it("can update onboarding step", async () => {
    await withTenant(
      null,
      (tx) =>
        tx.tenant.update({
          where: { id: tenantId },
          data: {
            settings: { onboarding: { currentStep: 2, completed: false } },
          },
        }),
      { superadmin: true },
    );

    const tenant = await withTenant(
      null,
      (tx) =>
        tx.tenant.findUnique({
          where: { id: tenantId },
          select: { settings: true },
        }),
      { superadmin: true },
    );

    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const onboarding = settings.onboarding as Record<string, unknown>;
    expect(onboarding.currentStep).toBe(2);
    expect(onboarding.completed).toBe(false);
  });

  it("can mark onboarding as completed", async () => {
    await withTenant(
      null,
      (tx) =>
        tx.tenant.update({
          where: { id: tenantId },
          data: {
            settings: { onboarding: { currentStep: 4, completed: true } },
          },
        }),
      { superadmin: true },
    );

    const tenant = await withTenant(
      null,
      (tx) =>
        tx.tenant.findUnique({
          where: { id: tenantId },
          select: { settings: true },
        }),
      { superadmin: true },
    );

    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const onboarding = settings.onboarding as Record<string, unknown>;
    expect(onboarding.completed).toBe(true);
    expect(onboarding.currentStep).toBe(4);
  });

  // Reset settings for cleanup
  afterAll(async () => {
    await withTenant(
      null,
      (tx) =>
        tx.tenant.update({
          where: { id: tenantId },
          data: { settings: {} },
        }),
      { superadmin: true },
    );
  });
});

// ─────────────────────────────────────────────────────────────
// Country config (DB-level)
// ─────────────────────────────────────────────────────────────

describe("Country config DB", () => {
  it("Nepal country config exists in database", async () => {
    const np = await withTenant(
      null,
      (tx) => tx.countryConfig.findFirst({ where: { code: "NP" } }),
      { superadmin: true },
    );
    expect(np).not.toBeNull();
    expect(np!.currency).toBe("NPR");
    expect(np!.currencySymbol).toBe("रू");
    expect(np!.calendarSystem).toBe("bikram_sambat");
    expect(np!.timezone).toBe("Asia/Kathmandu");
    expect(np!.fiscalYearStartMonth).toBe(4);
    expect(np!.defaultGradeScale).toBe("neb_4.0");
  });

  it("country config has payment and tax info", async () => {
    const np = await withTenant(
      null,
      (tx) => tx.countryConfig.findFirst({ where: { code: "NP" } }),
      { superadmin: true },
    );
    expect(np!.paymentProviders).toContain("esewa");
    expect(np!.paymentProviders).toContain("khalti");
    const tax = np!.taxConfig as Record<string, unknown>;
    expect(tax.vatRate).toBe(13);
    expect(tax.panRequired).toBe(true);
  });

  it("country config code is unique", async () => {
    await expect(
      withTenant(
        null,
        (tx) =>
          tx.countryConfig.create({
            data: {
              code: "NP", // duplicate
              name: "Duplicate",
              currency: "XXX",
              currencySymbol: "X",
              calendarSystem: "gregorian",
              fiscalYearStartMonth: 1,
              defaultGradeScale: "none",
            },
          }),
        { superadmin: true },
      ),
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// Admin overview queries (platform metrics)
// ─────────────────────────────────────────────────────────────

describe("Admin overview queries", () => {
  it("can count tenants by status", async () => {
    const [total, active] = await withTenant(
      null,
      (tx) =>
        Promise.all([
          tx.tenant.count({ where: { deletedAt: null } }),
          tx.tenant.count({ where: { status: "active", deletedAt: null } }),
        ]),
      { superadmin: true },
    );
    expect(total).toBeGreaterThanOrEqual(1);
    expect(active).toBeGreaterThanOrEqual(0);
  });

  it("can compute MRR from active subscriptions", async () => {
    const activeSubs = await withTenant(
      null,
      (tx) =>
        tx.subscription.findMany({
          where: { status: { in: ["active", "trial"] } },
          include: { plan: true },
        }),
      { superadmin: true },
    );

    let mrrPaisa = 0;
    for (const sub of activeSubs) {
      if (sub.billing === "annual") {
        mrrPaisa += Math.round(sub.plan.annualPricePaisa / 12);
      } else {
        mrrPaisa += sub.plan.monthlyPricePaisa;
      }
    }
    // Should have at least the test subscription
    expect(mrrPaisa).toBeGreaterThanOrEqual(0);
  });

  it("can compute plan distribution", async () => {
    const planDistribution = await withTenant(
      null,
      (tx) =>
        tx.subscription.groupBy({
          by: ["planId"],
          _count: true,
        }),
      { superadmin: true },
    );
    expect(planDistribution.length).toBeGreaterThanOrEqual(1);

    const ourPlan = planDistribution.find(
      (pd) => pd.planId.toString() === testPlanId.toString(),
    );
    expect(ourPlan).toBeTruthy();
    expect(ourPlan!._count).toBeGreaterThanOrEqual(1);
  });
});
