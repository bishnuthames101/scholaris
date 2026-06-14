import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../src/lib/db";

/**
 * Phase 10 RLS + integration tests.
 * Tests tenant isolation on plans, subscriptions, subscription_invoices,
 * country_configs. Also tests plan/subscription business logic.
 *
 * Requires DATABASE_URL with migrations + RLS applied (npm run db:rls).
 */

const prisma = new PrismaClient();

let tenantAId: bigint;
let tenantBId: bigint;
let planId: bigint;
let planPublicId: string;
let subAId: bigint;
let subAPublicId: string;

beforeAll(async () => {
  await withTenant(
    null,
    async (tx) => {
      // Create test tenants
      const a = await tx.tenant.upsert({
        where: { slug: "p10-rls-a" },
        update: {},
        create: { name: "P10 RLS Test A", slug: "p10-rls-a" },
      });
      const b = await tx.tenant.upsert({
        where: { slug: "p10-rls-b" },
        update: {},
        create: { name: "P10 RLS Test B", slug: "p10-rls-b" },
      });
      tenantAId = a.id;
      tenantBId = b.id;

      // Clean up any prior test data
      await tx.subscriptionInvoice.deleteMany({
        where: { tenantId: { in: [a.id, b.id] } },
      });
      await tx.subscription.deleteMany({
        where: { tenantId: { in: [a.id, b.id] } },
      });
      await tx.plan.deleteMany({
        where: { name: { startsWith: "P10_Test_" } },
      });

      // Create a test plan (platform-level, no tenant_id)
      const plan = await tx.plan.create({
        data: {
          name: "P10_Test_Starter",
          tier: "starter",
          monthlyPricePaisa: 99900,
          annualPricePaisa: 999900,
          maxStudents: 100,
          maxStaff: 20,
          maxMessagesPerMonth: 500,
          modules: ["sis", "attendance", "fees"],
          trialDays: 30,
        },
      });
      planId = plan.id;
      planPublicId = plan.publicId;

      // Create subscription for tenant A
      const now = new Date();
      const sub = await tx.subscription.create({
        data: {
          tenantId: a.id,
          planId: plan.id,
          status: "trial",
          billing: "monthly",
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 86400000),
          trialEndsAt: new Date(now.getTime() + 30 * 86400000),
        },
      });
      subAId = sub.id;
      subAPublicId = sub.publicId;

      // Create a subscription invoice for tenant A
      await tx.subscriptionInvoice.create({
        data: {
          subscriptionId: sub.id,
          tenantId: a.id,
          invoiceNo: "P10-TEST-001",
          periodStart: now,
          periodEnd: new Date(now.getTime() + 30 * 86400000),
          amountPaisa: 99900,
          totalPaisa: 99900,
        },
      });

      // Ensure Nepal country config exists
      await tx.countryConfig.upsert({
        where: { code: "NP" },
        update: {},
        create: {
          code: "NP",
          name: "Nepal",
          currency: "NPR",
          currencySymbol: "रू",
          locale: "ne",
          timezone: "Asia/Kathmandu",
          calendarSystem: "bikram_sambat",
          fiscalYearStartMonth: 4,
          defaultGradeScale: "neb_4.0",
          paymentProviders: ["esewa", "khalti"],
          taxConfig: { vatRate: 13, panRequired: true },
        },
      });
    },
    { superadmin: true },
  );
});

afterAll(async () => {
  await withTenant(
    null,
    async (tx) => {
      await tx.subscriptionInvoice.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      await tx.subscription.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      await tx.plan.deleteMany({
        where: { name: { startsWith: "P10_Test_" } },
      });
    },
    { superadmin: true },
  );
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────
// Plans — readable by all, writable by superadmin only
// ─────────────────────────────────────────────────────────────

describe("Plans RLS", () => {
  it("tenant A can read plans (platform-level data)", async () => {
    const plans = await withTenant(tenantAId, (tx) =>
      tx.plan.findMany({ where: { name: { startsWith: "P10_Test_" } } }),
    );
    expect(plans.length).toBeGreaterThanOrEqual(1);
    expect(plans[0].name).toBe("P10_Test_Starter");
  });

  it("tenant B can also read plans", async () => {
    const plans = await withTenant(tenantBId, (tx) =>
      tx.plan.findMany({ where: { name: { startsWith: "P10_Test_" } } }),
    );
    expect(plans.length).toBeGreaterThanOrEqual(1);
  });

  it("tenant A CANNOT create a plan (superadmin only)", async () => {
    await expect(
      withTenant(tenantAId, (tx) =>
        tx.plan.create({
          data: {
            name: "P10_Test_Sneaky",
            tier: "free",
            monthlyPricePaisa: 0,
            annualPricePaisa: 0,
            maxStudents: 10,
            maxStaff: 5,
            maxMessagesPerMonth: 50,
            modules: ["sis"],
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("tenant A CANNOT update a plan", async () => {
    await expect(
      withTenant(tenantAId, (tx) =>
        tx.plan.update({
          where: { id: planId },
          data: { name: "P10_Test_Hacked" },
        }),
      ),
    ).rejects.toThrow();
  });

  it("tenant A CANNOT delete a plan", async () => {
    await expect(
      withTenant(tenantAId, (tx) =>
        tx.plan.delete({ where: { id: planId } }),
      ),
    ).rejects.toThrow();
  });

  it("superadmin CAN create, update, delete plans", async () => {
    const plan = await withTenant(
      null,
      (tx) =>
        tx.plan.create({
          data: {
            name: "P10_Test_SuperOnly",
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
    expect(plan.name).toBe("P10_Test_SuperOnly");

    // Update
    const updated = await withTenant(
      null,
      (tx) =>
        tx.plan.update({
          where: { id: plan.id },
          data: { description: "Test update" },
        }),
      { superadmin: true },
    );
    expect(updated.description).toBe("Test update");

    // Delete
    await withTenant(
      null,
      (tx) => tx.plan.delete({ where: { id: plan.id } }),
      { superadmin: true },
    );
  });
});

// ─────────────────────────────────────────────────────────────
// Subscriptions — tenant-scoped
// ─────────────────────────────────────────────────────────────

describe("Subscriptions RLS", () => {
  it("tenant A sees its own subscription", async () => {
    const subs = await withTenant(tenantAId, (tx) =>
      tx.subscription.findMany(),
    );
    expect(subs).toHaveLength(1);
    expect(subs[0].publicId).toBe(subAPublicId);
  });

  it("tenant B CANNOT see tenant A's subscription", async () => {
    const subs = await withTenant(tenantBId, (tx) =>
      tx.subscription.findMany(),
    );
    expect(subs).toHaveLength(0);
  });

  it("tenant B CANNOT read tenant A's subscription by ID", async () => {
    const sub = await withTenant(tenantBId, (tx) =>
      tx.subscription.findUnique({ where: { id: subAId } }),
    );
    expect(sub).toBeNull();
  });

  it("tenant B CANNOT create a subscription for tenant A", async () => {
    await expect(
      withTenant(tenantBId, (tx) =>
        tx.subscription.create({
          data: {
            tenantId: tenantAId,
            planId: planId,
            status: "active",
            billing: "monthly",
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(),
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("tenant A CANNOT modify tenant B's data (no subscription exists, but ensures tenant scope)", async () => {
    // Even if tenant A somehow guessed tenant B's subscription ID, RLS blocks it
    const result = await withTenant(tenantAId, (tx) =>
      tx.subscription.updateMany({
        where: { tenantId: tenantBId },
        data: { status: "cancelled" },
      }),
    );
    expect(result.count).toBe(0);
  });

  it("superadmin sees all subscriptions", async () => {
    const subs = await withTenant(
      null,
      (tx) => tx.subscription.findMany(),
      { superadmin: true },
    );
    expect(subs.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────
// Subscription invoices — tenant-scoped
// ─────────────────────────────────────────────────────────────

describe("Subscription Invoices RLS", () => {
  it("tenant A sees its own invoices", async () => {
    const invoices = await withTenant(tenantAId, (tx) =>
      tx.subscriptionInvoice.findMany(),
    );
    expect(invoices).toHaveLength(1);
    expect(invoices[0].invoiceNo).toBe("P10-TEST-001");
  });

  it("tenant B CANNOT see tenant A's invoices", async () => {
    const invoices = await withTenant(tenantBId, (tx) =>
      tx.subscriptionInvoice.findMany(),
    );
    expect(invoices).toHaveLength(0);
  });

  it("tenant B CANNOT create an invoice for tenant A", async () => {
    await expect(
      withTenant(tenantBId, (tx) =>
        tx.subscriptionInvoice.create({
          data: {
            subscriptionId: subAId,
            tenantId: tenantAId,
            invoiceNo: "SNEAKY-001",
            periodStart: new Date(),
            periodEnd: new Date(),
            amountPaisa: 100,
            totalPaisa: 100,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// Country configs — readable by all, writable by superadmin
// ─────────────────────────────────────────────────────────────

describe("Country Configs RLS", () => {
  it("tenant A can read country configs", async () => {
    const configs = await withTenant(tenantAId, (tx) =>
      tx.countryConfig.findMany(),
    );
    expect(configs.length).toBeGreaterThanOrEqual(1);
    expect(configs.some((c) => c.code === "NP")).toBe(true);
  });

  it("tenant B can also read country configs", async () => {
    const configs = await withTenant(tenantBId, (tx) =>
      tx.countryConfig.findMany(),
    );
    expect(configs.length).toBeGreaterThanOrEqual(1);
  });

  it("tenant A CANNOT create a country config", async () => {
    await expect(
      withTenant(tenantAId, (tx) =>
        tx.countryConfig.create({
          data: {
            code: "XX_SNEAKY",
            name: "Hacked",
            currency: "XXX",
            currencySymbol: "X",
            calendarSystem: "gregorian",
            fiscalYearStartMonth: 1,
            defaultGradeScale: "none",
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("tenant A CANNOT update a country config", async () => {
    const np = await withTenant(tenantAId, (tx) =>
      tx.countryConfig.findFirst({ where: { code: "NP" } }),
    );
    if (np) {
      await expect(
        withTenant(tenantAId, (tx) =>
          tx.countryConfig.update({
            where: { id: np.id },
            data: { name: "Hacked Nepal" },
          }),
        ),
      ).rejects.toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Business logic tests (subscription behavior)
// ─────────────────────────────────────────────────────────────

describe("Subscription business logic", () => {
  it("plan has correct limits", async () => {
    const plan = await withTenant(
      null,
      (tx) => tx.plan.findFirst({ where: { name: "P10_Test_Starter" } }),
      { superadmin: true },
    );
    expect(plan).not.toBeNull();
    expect(plan!.maxStudents).toBe(100);
    expect(plan!.maxStaff).toBe(20);
    expect(plan!.maxMessagesPerMonth).toBe(500);
    expect(plan!.modules).toContain("sis");
    expect(plan!.modules).toContain("attendance");
    expect(plan!.modules).toContain("fees");
    expect(plan!.modules).not.toContain("library"); // not in starter
  });

  it("subscription is linked to correct plan and tenant", async () => {
    const sub = await withTenant(
      null,
      (tx) =>
        tx.subscription.findUnique({
          where: { tenantId: tenantAId },
          include: { plan: true },
        }),
      { superadmin: true },
    );
    expect(sub).not.toBeNull();
    expect(sub!.status).toBe("trial");
    expect(sub!.plan.name).toBe("P10_Test_Starter");
    expect(sub!.trialEndsAt).not.toBeNull();
  });

  it("subscription invoice has correct amounts", async () => {
    const inv = await withTenant(
      null,
      (tx) =>
        tx.subscriptionInvoice.findFirst({
          where: { tenantId: tenantAId },
        }),
      { superadmin: true },
    );
    expect(inv).not.toBeNull();
    expect(inv!.amountPaisa).toBe(99900);
    expect(inv!.totalPaisa).toBe(99900);
    expect(inv!.status).toBe("pending");
  });

  it("one-subscription-per-tenant constraint holds", async () => {
    await expect(
      withTenant(
        null,
        (tx) =>
          tx.subscription.create({
            data: {
              tenantId: tenantAId,
              planId: planId,
              status: "active",
              billing: "monthly",
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(),
            },
          }),
        { superadmin: true },
      ),
    ).rejects.toThrow(); // unique constraint on tenantId
  });
});
