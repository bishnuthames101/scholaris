import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../src/lib/db";
import { computeSlip } from "../src/lib/hr/payroll";

/**
 * Phase 8C — HR & Payroll tests.
 * Tests staff attendance, leaves, salary, payroll computation, and RLS isolation.
 */

const prisma = new PrismaClient();

let tenantId: bigint;
let tenantId2: bigint;
let staffId: bigint;

beforeAll(async () => {
  await withTenant(
    null,
    async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { slug: "hr-test" },
        update: {},
        create: { name: "HR Test School", slug: "hr-test" },
      });
      tenantId = tenant.id;

      const tenant2 = await tx.tenant.upsert({
        where: { slug: "hr-test-2" },
        update: {},
        create: { name: "HR Test School 2", slug: "hr-test-2" },
      });
      tenantId2 = tenant2.id;

      // Clean up leftover data from prior runs
      await tx.leaveRequest.deleteMany({ where: { tenantId } });
      await tx.leaveRequest.deleteMany({ where: { tenantId: tenantId2 } });
      await tx.staffAttendance.deleteMany({ where: { tenantId } });
      await tx.staffAttendance.deleteMany({ where: { tenantId: tenantId2 } });

      const staff =
        (await tx.staff.findFirst({ where: { tenantId, email: "hr-test@test.example" } })) ??
        (await tx.staff.create({
          data: { tenantId, name: "HR Staff", designation: "Teacher", email: "hr-test@test.example" },
        }));
      staffId = staff.id;
    },
    { superadmin: true },
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Payroll computation", () => {
  it("computes full salary when all days present", () => {
    const result = computeSlip(
      { basicPaisa: 5000000, allowancesPaisa: 1000000, deductionsPaisa: 500000 },
      { presentDays: 26, absentDays: 0, leaveDays: 0, halfDays: 0, totalWorkingDays: 26 },
    );
    expect(result.basicPaisa).toBe(5000000);
    expect(result.netPaisa).toBe(5500000); // 50000 + 10000 - 5000
  });

  it("pro-rates salary for absent days", () => {
    const result = computeSlip(
      { basicPaisa: 2600000, allowancesPaisa: 0, deductionsPaisa: 0 },
      { presentDays: 13, absentDays: 13, leaveDays: 0, halfDays: 0, totalWorkingDays: 26 },
    );
    expect(result.basicPaisa).toBe(1300000); // half salary
    expect(result.netPaisa).toBe(1300000);
  });

  it("counts leave days as worked", () => {
    const result = computeSlip(
      { basicPaisa: 2600000, allowancesPaisa: 0, deductionsPaisa: 0 },
      { presentDays: 20, absentDays: 0, leaveDays: 6, halfDays: 0, totalWorkingDays: 26 },
    );
    expect(result.basicPaisa).toBe(2600000); // full salary
    expect(result.leaveDays).toBe(6);
  });

  it("counts half days as 0.5", () => {
    const result = computeSlip(
      { basicPaisa: 2600000, allowancesPaisa: 0, deductionsPaisa: 0 },
      { presentDays: 24, absentDays: 0, leaveDays: 0, halfDays: 4, totalWorkingDays: 26 },
    );
    // effective = 24 + 0 + 4*0.5 = 26
    expect(result.basicPaisa).toBe(2600000);
  });

  it("returns 0 net when deductions exceed gross", () => {
    const result = computeSlip(
      { basicPaisa: 100000, allowancesPaisa: 0, deductionsPaisa: 200000 },
      { presentDays: 26, absentDays: 0, leaveDays: 0, halfDays: 0, totalWorkingDays: 26 },
    );
    expect(result.netPaisa).toBe(0);
  });
});

describe("Staff attendance", () => {
  it("creates attendance record", async () => {
    const record = await withTenant(tenantId, async (tx) => {
      return tx.staffAttendance.create({
        data: {
          tenantId,
          staffId,
          date: new Date("2026-06-01T00:00:00.000Z"),
          status: "present",
          source: "manual",
        },
      });
    });
    expect(record.status).toBe("present");
  });

  it("enforces unique attendance per staff per date", async () => {
    await expect(
      withTenant(tenantId, async (tx) => {
        return tx.staffAttendance.create({
          data: {
            tenantId,
            staffId,
            date: new Date("2026-06-01T00:00:00.000Z"),
            status: "absent",
            source: "manual",
          },
        });
      }),
    ).rejects.toThrow();
  });

  it("allows upsert for same date", async () => {
    const updated = await withTenant(tenantId, async (tx) => {
      return tx.staffAttendance.upsert({
        where: {
          tenantId_staffId_date: {
            tenantId,
            staffId,
            date: new Date("2026-06-01T00:00:00.000Z"),
          },
        },
        update: { status: "late" },
        create: { tenantId, staffId, date: new Date("2026-06-01T00:00:00.000Z"), status: "late", source: "manual" },
      });
    });
    expect(updated.status).toBe("late");
  });
});

describe("Leave requests", () => {
  it("creates a leave request", async () => {
    const leave = await withTenant(tenantId, async (tx) => {
      return tx.leaveRequest.create({
        data: {
          tenantId,
          staffId,
          leaveType: "casual",
          startDate: new Date("2026-07-01T00:00:00.000Z"),
          endDate: new Date("2026-07-03T00:00:00.000Z"),
          days: 3,
          reason: "Family event",
        },
      });
    });
    expect(leave.status).toBe("pending");
    expect(leave.days).toBe(3);
  });

  it("can approve a leave", async () => {
    const leave = await withTenant(tenantId, async (tx) => {
      const pending = await tx.leaveRequest.findFirst({
        where: { tenantId, staffId, status: "pending" },
      });
      return tx.leaveRequest.update({
        where: { id: pending!.id },
        data: { status: "approved", reviewedBy: "admin", reviewedAt: new Date() },
      });
    });
    expect(leave.status).toBe("approved");
  });
});

describe("RLS isolation — HR", () => {
  it("cannot read staff attendance from another tenant", async () => {
    const records = await withTenant(tenantId2, async (tx) => {
      return tx.staffAttendance.findMany({ where: { tenantId } });
    });
    expect(records.length).toBe(0);
  });

  it("cannot read leave requests from another tenant", async () => {
    const leaves = await withTenant(tenantId2, async (tx) => {
      return tx.leaveRequest.findMany({ where: { tenantId } });
    });
    expect(leaves.length).toBe(0);
  });
});
