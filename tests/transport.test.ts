import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../src/lib/db";

/**
 * Phase 8B — Transport tests.
 * Tests route/stop CRUD, assignments, and RLS isolation.
 */

const prisma = new PrismaClient();

let tenantId: bigint;
let tenantId2: bigint;
let yearId: bigint;
let studentId: bigint;
let routeId: bigint;
let stopId: bigint;

beforeAll(async () => {
  await withTenant(
    null,
    async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { slug: "trans-test" },
        update: {},
        create: { name: "Transport Test School", slug: "trans-test" },
      });
      tenantId = tenant.id;

      const tenant2 = await tx.tenant.upsert({
        where: { slug: "trans-test-2" },
        update: {},
        create: { name: "Transport Test School 2", slug: "trans-test-2" },
      });
      tenantId2 = tenant2.id;

      // Clean up leftover data from prior runs
      await tx.transportAssignment.deleteMany({ where: { tenantId } });
      await tx.transportAssignment.deleteMany({ where: { tenantId: tenantId2 } });
      await tx.transportStop.deleteMany({ where: { tenantId } });
      await tx.transportStop.deleteMany({ where: { tenantId: tenantId2 } });
      await tx.transportRoute.deleteMany({ where: { tenantId } });
      await tx.transportRoute.deleteMany({ where: { tenantId: tenantId2 } });

      const year = await tx.academicYear.upsert({
        where: { tenantId_name: { tenantId, name: "TRANS-2099" } },
        update: { isCurrent: true },
        create: { tenantId, name: "TRANS-2099", isCurrent: true, startsAt: new Date("2099-04-14"), endsAt: new Date("2100-04-13") },
      });
      yearId = year.id;

      const cls =
        (await tx.schoolClass.findFirst({ where: { tenantId, name: "Trans Class" } })) ??
        (await tx.schoolClass.create({ data: { tenantId, gradeLevel: 5, name: "Trans Class" } }));

      const student = await tx.student.upsert({
        where: { tenantId_admissionNo: { tenantId, admissionNo: "TRN-001" } },
        update: {},
        create: { tenantId, name: "Trans Student", admissionNo: "TRN-001", gender: "female", dob: new Date("2015-06-01") },
      });
      studentId = student.id;
    },
    { superadmin: true },
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Transport route CRUD", () => {
  it("creates a route", async () => {
    const route = await withTenant(tenantId, async (tx) => {
      return tx.transportRoute.create({
        data: { tenantId, name: "Route A", vehicleNo: "BA-1-2345", driverName: "Ram", capacity: 40 },
      });
    });
    routeId = route.id;
    expect(route.name).toBe("Route A");
    expect(route.isActive).toBe(true);
  });

  it("enforces unique route name per tenant", async () => {
    await expect(
      withTenant(tenantId, async (tx) => {
        return tx.transportRoute.create({
          data: { tenantId, name: "Route A" },
        });
      }),
    ).rejects.toThrow();
  });

  it("allows same route name in different tenant", async () => {
    const route = await withTenant(tenantId2, async (tx) => {
      return tx.transportRoute.create({
        data: { tenantId: tenantId2, name: "Route A" },
      });
    });
    expect(route.name).toBe("Route A");
  });
});

describe("Transport stops", () => {
  it("creates a stop on a route", async () => {
    const stop = await withTenant(tenantId, async (tx) => {
      return tx.transportStop.create({
        data: { tenantId, routeId, name: "Main Gate", sortOrder: 1, pickupTime: "07:30", dropTime: "16:00" },
      });
    });
    stopId = stop.id;
    expect(stop.name).toBe("Main Gate");
    expect(stop.pickupTime).toBe("07:30");
  });

  it("enforces unique stop name per route", async () => {
    await expect(
      withTenant(tenantId, async (tx) => {
        return tx.transportStop.create({
          data: { tenantId, routeId, name: "Main Gate", sortOrder: 2 },
        });
      }),
    ).rejects.toThrow();
  });
});

describe("Transport assignments", () => {
  it("assigns a student to a route/stop", async () => {
    const assignment = await withTenant(tenantId, async (tx) => {
      return tx.transportAssignment.create({
        data: {
          tenantId,
          studentId,
          routeId,
          stopId,
          academicYearId: yearId,
          monthlyFeePaisa: 200000,
        },
      });
    });
    expect(assignment.monthlyFeePaisa).toBe(200000);
    expect(assignment.isActive).toBe(true);
  });

  it("enforces one assignment per student per year", async () => {
    await expect(
      withTenant(tenantId, async (tx) => {
        return tx.transportAssignment.create({
          data: { tenantId, studentId, routeId, stopId, academicYearId: yearId },
        });
      }),
    ).rejects.toThrow();
  });
});

describe("RLS isolation — transport", () => {
  it("cannot read routes from another tenant", async () => {
    const routes = await withTenant(tenantId2, async (tx) => {
      return tx.transportRoute.findMany({ where: { tenantId } });
    });
    expect(routes.length).toBe(0);
  });

  it("cannot read assignments from another tenant", async () => {
    const assignments = await withTenant(tenantId2, async (tx) => {
      return tx.transportAssignment.findMany({ where: { tenantId } });
    });
    expect(assignments.length).toBe(0);
  });
});
