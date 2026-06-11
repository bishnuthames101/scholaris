import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../src/lib/db";

/**
 * Tenant isolation test (Phase 0 acceptance).
 * Requires DATABASE_URL pointing at a database with migrations + RLS applied.
 *
 * NOTE: RLS only bites when the connection role is not BYPASSRLS. On Supabase,
 * run the app as the non-bypass role; tables FORCE RLS so even the owner is
 * subject to policies.
 */

const prisma = new PrismaClient();

let tenantAId: bigint;
let tenantBId: bigint;

beforeAll(async () => {
  await withTenant(
    null,
    async (tx) => {
      const a = await tx.tenant.upsert({
        where: { slug: "iso-test-a" },
        update: {},
        create: { name: "Isolation Test A", slug: "iso-test-a" },
      });
      const b = await tx.tenant.upsert({
        where: { slug: "iso-test-b" },
        update: {},
        create: { name: "Isolation Test B", slug: "iso-test-b" },
      });
      tenantAId = a.id;
      tenantBId = b.id;

      await tx.user.deleteMany({
        where: { tenantId: { in: [a.id, b.id] } },
      });
      await tx.user.create({
        data: {
          tenantId: a.id,
          name: "User A",
          email: "a@iso.test",
          passwordHash: "x",
        },
      });
      await tx.user.create({
        data: {
          tenantId: b.id,
          name: "User B",
          email: "b@iso.test",
          passwordHash: "x",
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
      await tx.user.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    },
    { superadmin: true },
  );
  await prisma.$disconnect();
});

describe("RLS tenant isolation", () => {
  it("tenant A sees only its own users", async () => {
    const users = await withTenant(tenantAId, (tx) =>
      tx.user.findMany({ where: { email: { endsWith: "@iso.test" } } }),
    );
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe("a@iso.test");
  });

  it("tenant B cannot see tenant A's users", async () => {
    const users = await withTenant(tenantBId, (tx) =>
      tx.user.findMany({ where: { email: "a@iso.test" } }),
    );
    expect(users).toHaveLength(0);
  });

  it("tenant A cannot see other tenants in the tenants table", async () => {
    const tenants = await withTenant(tenantAId, (tx) =>
      tx.tenant.findMany({ where: { slug: { startsWith: "iso-test" } } }),
    );
    expect(tenants).toHaveLength(1);
    expect(tenants[0].slug).toBe("iso-test-a");
  });

  it("tenant A cannot insert a row for tenant B", async () => {
    await expect(
      withTenant(tenantAId, (tx) =>
        tx.user.create({
          data: {
            tenantId: tenantBId,
            name: "Sneaky",
            email: "sneaky@iso.test",
            passwordHash: "x",
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("superadmin context sees both tenants", async () => {
    const tenants = await withTenant(
      null,
      (tx) => tx.tenant.findMany({ where: { slug: { startsWith: "iso-test" } } }),
      { superadmin: true },
    );
    expect(tenants.length).toBe(2);
  });

  it("audit_log rejects UPDATE (append-only)", async () => {
    const entry = await withTenant(
      tenantAId,
      async (tx) => {
        await tx.auditLog.create({
          data: { tenantId: tenantAId, action: "create", entity: "test" },
        });
        return tx.auditLog.findFirst({
          where: { tenantId: tenantAId, entity: "test" },
        });
      },
    );
    expect(entry).not.toBeNull();
    await expect(
      withTenant(tenantAId, (tx) =>
        tx.auditLog.update({ where: { id: entry!.id }, data: { action: "tampered" } }),
      ),
    ).rejects.toThrow();
  });
});
