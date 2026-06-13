import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../src/lib/db";

/**
 * Phase 5 RLS coverage: notification_templates, notifications,
 * message_credits, credit_transactions, contact_groups,
 * contact_group_members — tenant isolation + append-only policies.
 *
 * Requires DATABASE_URL with migrations + RLS applied (npm run db:rls).
 */

const prisma = new PrismaClient();

let tenantAId: bigint;
let tenantBId: bigint;
let templateAId: bigint;
let notificationAId: bigint;
let creditTxAId: bigint;
let groupAId: bigint;

beforeAll(async () => {
  await withTenant(
    null,
    async (tx) => {
      const a = await tx.tenant.upsert({
        where: { slug: "notif-rls-a" },
        update: {},
        create: { name: "Notif RLS Test A", slug: "notif-rls-a" },
      });
      const b = await tx.tenant.upsert({
        where: { slug: "notif-rls-b" },
        update: {},
        create: { name: "Notif RLS Test B", slug: "notif-rls-b" },
      });
      tenantAId = a.id;
      tenantBId = b.id;

      // --- Tenant A fixtures ---

      // NotificationTemplate
      const template = await tx.notificationTemplate.upsert({
        where: { tenantId_slug: { tenantId: a.id, slug: "rls_test_tpl" } },
        update: {},
        create: {
          tenantId: a.id,
          name: "RLS Test Template",
          slug: "rls_test_tpl",
          bodyEn: "Hello {{name}}",
          variables: ["name"],
        },
      });
      templateAId = template.id;

      // Notification (no hard deletes allowed)
      const notif = await tx.notification.create({
        data: {
          tenantId: a.id,
          templateId: template.id,
          channel: "sms",
          status: "sent",
          bodyEn: "Hello Ram",
          triggerType: "bulk",
        },
      });
      notificationAId = notif.id;

      // MessageCredit
      await tx.messageCredit.upsert({
        where: { tenantId: a.id },
        update: { balance: 500 },
        create: { tenantId: a.id, balance: 500, totalUsed: 50 },
      });

      // CreditTransaction (append-only)
      const creditTx = await tx.creditTransaction.create({
        data: {
          tenantId: a.id,
          amount: 500,
          balanceAfter: 500,
          reason: "rls_test_topup",
        },
      });
      creditTxAId = creditTx.id;

      // ContactGroup + member
      const group = await tx.contactGroup.upsert({
        where: { tenantId_name: { tenantId: a.id, name: "RLS Test Group" } },
        update: {},
        create: {
          tenantId: a.id,
          name: "RLS Test Group",
          type: "custom",
        },
      });
      groupAId = group.id;

      // Ensure a member exists (find-or-create since no good unique key)
      const existingMember = await tx.contactGroupMember.findFirst({
        where: { groupId: group.id, phone: "+977-9800000001" },
      });
      if (!existingMember) {
        await tx.contactGroupMember.create({
          data: {
            tenantId: a.id,
            groupId: group.id,
            phone: "+977-9800000001",
            name: "RLS Test Contact",
          },
        });
      }
    },
    { superadmin: true, timeoutMs: 30_000 },
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────
// Tenant isolation
// ─────────────────────────────────────────────────────────────

describe("RLS — Phase 5 tenant isolation", () => {
  it("tenant A sees its templates; tenant B does not", async () => {
    const mine = await withTenant(tenantAId, (tx) =>
      tx.notificationTemplate.findMany({ where: { slug: "rls_test_tpl" } }),
    );
    expect(mine).toHaveLength(1);

    const theirs = await withTenant(tenantBId, (tx) =>
      tx.notificationTemplate.findMany({ where: { slug: "rls_test_tpl" } }),
    );
    expect(theirs).toHaveLength(0);
  });

  it("tenant B cannot see tenant A's notifications", async () => {
    const rows = await withTenant(tenantBId, (tx) =>
      tx.notification.findMany({ where: { id: notificationAId } }),
    );
    expect(rows).toHaveLength(0);
  });

  it("tenant B cannot see tenant A's message credits", async () => {
    const rows = await withTenant(tenantBId, (tx) =>
      tx.messageCredit.findMany({ where: { tenantId: tenantAId } }),
    );
    expect(rows).toHaveLength(0);
  });

  it("tenant B cannot see tenant A's credit transactions", async () => {
    const rows = await withTenant(tenantBId, (tx) =>
      tx.creditTransaction.findMany({ where: { tenantId: tenantAId } }),
    );
    expect(rows).toHaveLength(0);
  });

  it("tenant B cannot see tenant A's contact groups", async () => {
    const rows = await withTenant(tenantBId, (tx) =>
      tx.contactGroup.findMany({ where: { name: "RLS Test Group" } }),
    );
    expect(rows).toHaveLength(0);
  });

  it("tenant B cannot see tenant A's group members", async () => {
    const rows = await withTenant(tenantBId, (tx) =>
      tx.contactGroupMember.findMany({ where: { groupId: groupAId } }),
    );
    expect(rows).toHaveLength(0);
  });

  // WITH CHECK — cross-tenant write attempts
  it("tenant A cannot create a template for tenant B", async () => {
    await expect(
      withTenant(tenantAId, (tx) =>
        tx.notificationTemplate.create({
          data: {
            tenantId: tenantBId,
            name: "Sneaky Template",
            slug: "sneaky_tpl",
            bodyEn: "Hack",
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("tenant A cannot create a notification for tenant B", async () => {
    await expect(
      withTenant(tenantAId, (tx) =>
        tx.notification.create({
          data: {
            tenantId: tenantBId,
            channel: "sms",
            bodyEn: "Sneaky",
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("tenant A cannot create a credit transaction for tenant B", async () => {
    await expect(
      withTenant(tenantAId, (tx) =>
        tx.creditTransaction.create({
          data: {
            tenantId: tenantBId,
            amount: 100,
            balanceAfter: 100,
            reason: "sneaky",
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// Append-only / no-delete policies
// ─────────────────────────────────────────────────────────────

describe("RLS — Phase 5 append-only / no-delete policies", () => {
  it("credit_transactions cannot be updated (even by owning tenant)", async () => {
    const res = await withTenant(tenantAId, (tx) =>
      tx.creditTransaction.updateMany({
        where: { id: creditTxAId },
        data: { amount: 9999 },
      }),
    );
    expect(res.count).toBe(0);
  });

  it("credit_transactions cannot be deleted (even by owning tenant)", async () => {
    const res = await withTenant(tenantAId, (tx) =>
      tx.creditTransaction.deleteMany({ where: { id: creditTxAId } }),
    );
    expect(res.count).toBe(0);
    // Verify still exists
    const still = await withTenant(tenantAId, (tx) =>
      tx.creditTransaction.findFirst({ where: { id: creditTxAId } }),
    );
    expect(still).not.toBeNull();
  });

  it("credit_transactions cannot be deleted by superadmin either", async () => {
    const res = await withTenant(
      null,
      (tx) => tx.creditTransaction.deleteMany({ where: { id: creditTxAId } }),
      { superadmin: true },
    );
    expect(res.count).toBe(0);
  });

  it("notifications cannot be hard-deleted (even by owning tenant)", async () => {
    const res = await withTenant(tenantAId, (tx) =>
      tx.notification.deleteMany({ where: { id: notificationAId } }),
    );
    expect(res.count).toBe(0);
    // Verify still exists
    const still = await withTenant(tenantAId, (tx) =>
      tx.notification.findFirst({ where: { id: notificationAId } }),
    );
    expect(still).not.toBeNull();
  });

  it("notifications cannot be hard-deleted by superadmin either", async () => {
    const res = await withTenant(
      null,
      (tx) => tx.notification.deleteMany({ where: { id: notificationAId } }),
      { superadmin: true },
    );
    expect(res.count).toBe(0);
  });
});
