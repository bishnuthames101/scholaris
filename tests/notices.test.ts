import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";

/**
 * Phase 7 — Notices tests.
 * Tests CRUD, audience targeting, read receipts, and RLS isolation.
 */

const prisma = new PrismaClient();

let tenantId: bigint;
let staffId: bigint;
let userId: bigint;
let noticeId: bigint;

beforeAll(async () => {
  await withTenant(
    null,
    async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { slug: "notice-test" },
        update: {},
        create: { name: "Notice Test School", slug: "notice-test" },
      });
      tenantId = tenant.id;

      const staff = (await tx.staff.findFirst({ where: { tenantId, email: "notice-author@test.example" } })) ??
        (await tx.staff.create({ data: { tenantId, name: "Notice Author", designation: "Principal", email: "notice-author@test.example" } }));
      staffId = staff.id;

      const passwordHash = await hashPassword("TestPass1!");
      const user = await tx.user.upsert({
        where: { tenantId_email: { tenantId, email: "notice-reader@test.example" } },
        update: { passwordHash },
        create: { tenantId, name: "Notice Reader", email: "notice-reader@test.example", passwordHash },
      });
      userId = user.id;
    },
    { superadmin: true, timeoutMs: 30_000 },
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────
// Notice CRUD
// ─────────────────────────────────────────────────────────────

describe("notice CRUD", () => {
  it("can create a notice", async () => {
    const notice = await withTenant(tenantId, (tx) =>
      tx.notice.create({
        data: {
          tenantId,
          authorId: staffId,
          title: "School Reopens",
          titleNe: "विद्यालय पुनः खुल्छ",
          body: "School will reopen on Monday.",
          bodyNe: "विद्यालय सोमबार पुनः खुल्नेछ।",
          category: "general",
          audience: "all",
          publishedAt: new Date(),
        },
      }),
    );
    noticeId = notice.id;
    expect(notice.title).toBe("School Reopens");
    expect(notice.category).toBe("general");
  });

  it("can create targeted notices", async () => {
    const notice = await withTenant(tenantId, (tx) =>
      tx.notice.create({
        data: {
          tenantId,
          authorId: staffId,
          title: "Staff Meeting",
          body: "All staff must attend the meeting at 3 PM.",
          category: "general",
          audience: "staff",
          publishedAt: new Date(),
        },
      }),
    );
    expect(notice.audience).toBe("staff");
  });

  it("can create pinned notices", async () => {
    const notice = await withTenant(tenantId, (tx) =>
      tx.notice.create({
        data: {
          tenantId,
          authorId: staffId,
          title: "Important: Exam Schedule",
          body: "Final exams start next week.",
          category: "exam",
          audience: "all",
          isPinned: true,
          publishedAt: new Date(),
        },
      }),
    );
    expect(notice.isPinned).toBe(true);
  });

  it("pinned notices sort first", async () => {
    const notices = await withTenant(tenantId, (tx) =>
      tx.notice.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        select: { title: true, isPinned: true },
      }),
    );
    expect(notices.length).toBeGreaterThan(0);
    // First notice should be pinned
    expect(notices[0].isPinned).toBe(true);
  });

  it("can soft-delete a notice", async () => {
    const deleted = await withTenant(tenantId, (tx) =>
      tx.notice.update({ where: { id: noticeId }, data: { deletedAt: new Date() } }),
    );
    expect(deleted.deletedAt).toBeTruthy();

    const active = await withTenant(tenantId, (tx) =>
      tx.notice.findMany({ where: { tenantId, deletedAt: null } }),
    );
    expect(active.find((n) => n.id === noticeId)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// Read receipts
// ─────────────────────────────────────────────────────────────

describe("notice read receipts", () => {
  let activeNoticeId: bigint;

  beforeAll(async () => {
    const n = await withTenant(tenantId, (tx) =>
      tx.notice.findFirst({ where: { tenantId, deletedAt: null, publishedAt: { not: null } } }),
    );
    activeNoticeId = n!.id;
  });

  it("can mark a notice as read", async () => {
    const read = await withTenant(
      tenantId,
      (tx) => tx.noticeRead.upsert({
        where: { noticeId_userId: { noticeId: activeNoticeId, userId } },
        update: {},
        create: { noticeId: activeNoticeId, userId },
      }),
    );
    expect(read.readAt).toBeTruthy();
  });

  it("read count reflects reads", async () => {
    const notice = await withTenant(tenantId, (tx) =>
      tx.notice.findFirst({
        where: { id: activeNoticeId },
        include: { _count: { select: { readReceipts: true } } },
      }),
    );
    expect(notice!._count.readReceipts).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────
// RLS isolation
// ─────────────────────────────────────────────────────────────

describe("notice RLS isolation", () => {
  let otherTenantId: bigint;

  beforeAll(async () => {
    await withTenant(null, async (tx) => {
      const t = await tx.tenant.upsert({ where: { slug: "notice-test-b" }, update: {}, create: { name: "Notice Test B", slug: "notice-test-b" } });
      otherTenantId = t.id;
    }, { superadmin: true });
  });

  it("other tenant cannot see notices", async () => {
    const notices = await withTenant(otherTenantId, (tx) =>
      tx.notice.findMany({ where: { tenantId } }),
    );
    expect(notices).toHaveLength(0);
  });
});
