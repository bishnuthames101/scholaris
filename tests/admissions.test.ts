import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../src/lib/db";

/**
 * Phase 8D — Admissions & Enquiry CRM tests.
 * Tests enquiry CRUD, follow-ups, applications, status transitions, and RLS isolation.
 */

const prisma = new PrismaClient();

let tenantId: bigint;
let tenantId2: bigint;
let yearId: bigint;
let classId: bigint;
let enquiryId: bigint;

beforeAll(async () => {
  await withTenant(
    null,
    async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { slug: "adm-test" },
        update: {},
        create: { name: "Admissions Test School", slug: "adm-test" },
      });
      tenantId = tenant.id;

      const tenant2 = await tx.tenant.upsert({
        where: { slug: "adm-test-2" },
        update: {},
        create: { name: "Admissions Test School 2", slug: "adm-test-2" },
      });
      tenantId2 = tenant2.id;

      // Clean up leftover data from prior runs
      await tx.admissionApplication.deleteMany({ where: { tenantId } });
      await tx.admissionApplication.deleteMany({ where: { tenantId: tenantId2 } });
      await tx.enquiryFollowUp.deleteMany({ where: { tenantId } });
      await tx.enquiryFollowUp.deleteMany({ where: { tenantId: tenantId2 } });
      await tx.enquiry.deleteMany({ where: { tenantId } });
      await tx.enquiry.deleteMany({ where: { tenantId: tenantId2 } });

      const year = await tx.academicYear.upsert({
        where: { tenantId_name: { tenantId, name: "ADM-2099" } },
        update: { isCurrent: true },
        create: { tenantId, name: "ADM-2099", isCurrent: true, startsAt: new Date("2099-04-14"), endsAt: new Date("2100-04-13") },
      });
      yearId = year.id;

      const cls =
        (await tx.schoolClass.findFirst({ where: { tenantId, name: "Adm Class 1" } })) ??
        (await tx.schoolClass.create({ data: { tenantId, gradeLevel: 1, name: "Adm Class 1" } }));
      classId = cls.id;
    },
    { superadmin: true },
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Enquiry CRUD", () => {
  it("creates an enquiry", async () => {
    const enquiry = await withTenant(tenantId, async (tx) => {
      return tx.enquiry.create({
        data: {
          tenantId,
          academicYearId: yearId,
          studentName: "Test Child",
          guardianName: "Test Parent",
          guardianPhone: "+9779800000000",
          source: "walk_in",
          applyingForClassId: classId,
        },
      });
    });
    enquiryId = enquiry.id;
    expect(enquiry.status).toBe("new_enquiry");
    expect(enquiry.source).toBe("walk_in");
  });

  it("updates enquiry status", async () => {
    const updated = await withTenant(tenantId, async (tx) => {
      return tx.enquiry.update({
        where: { id: enquiryId },
        data: { status: "contacted", lastContactedAt: new Date() },
      });
    });
    expect(updated.status).toBe("contacted");
  });

  it("soft-deletes an enquiry", async () => {
    // Create another to delete
    const enq = await withTenant(tenantId, async (tx) => {
      return tx.enquiry.create({
        data: {
          tenantId,
          academicYearId: yearId,
          studentName: "Delete Me",
          guardianName: "Parent",
          guardianPhone: "+9779800000001",
          source: "phone",
        },
      });
    });

    await withTenant(tenantId, async (tx) => {
      await tx.enquiry.update({ where: { id: enq.id }, data: { deletedAt: new Date() } });
    });

    const found = await withTenant(tenantId, async (tx) => {
      return tx.enquiry.findFirst({ where: { id: enq.id, deletedAt: null } });
    });
    expect(found).toBeNull();
  });
});

describe("Enquiry follow-ups", () => {
  it("adds a follow-up to an enquiry", async () => {
    const followUp = await withTenant(tenantId, async (tx) => {
      return tx.enquiryFollowUp.create({
        data: {
          tenantId,
          enquiryId,
          note: "Called parent, visit scheduled for next week",
          contactedVia: "phone",
          nextFollowUp: new Date("2026-07-01T00:00:00.000Z"),
        },
      });
    });
    expect(followUp.contactedVia).toBe("phone");
  });
});

describe("Admission applications", () => {
  it("creates an application linked to enquiry", async () => {
    const app = await withTenant(tenantId, async (tx) => {
      return tx.admissionApplication.create({
        data: {
          tenantId,
          applicationNo: "2083/84-APP-000001",
          fiscalYear: "2083/84",
          seq: 1,
          academicYearId: yearId,
          enquiryId,
          studentName: "Test Child",
          gender: "male",
          applyingForClassId: classId,
          guardianName: "Test Parent",
          guardianPhone: "+9779800000000",
          status: "submitted",
        },
      });
    });
    expect(app.status).toBe("submitted");
    expect(app.applicationNo).toBe("2083/84-APP-000001");
  });

  it("approves an application", async () => {
    const approved = await withTenant(tenantId, async (tx) => {
      const app = await tx.admissionApplication.findFirst({
        where: { tenantId, status: "submitted" },
      });
      return tx.admissionApplication.update({
        where: { id: app!.id },
        data: { status: "app_approved", reviewedBy: "admin", reviewedAt: new Date() },
      });
    });
    expect(approved.status).toBe("app_approved");
  });

  it("enforces unique applicationNo per tenant", async () => {
    await expect(
      withTenant(tenantId, async (tx) => {
        return tx.admissionApplication.create({
          data: {
            tenantId,
            applicationNo: "2083/84-APP-000001",
            fiscalYear: "2083/84",
            seq: 1,
            academicYearId: yearId,
            studentName: "Dup",
            gender: "female",
            applyingForClassId: classId,
            guardianName: "Dup Parent",
            guardianPhone: "+9779800000002",
            status: "submitted",
          },
        });
      }),
    ).rejects.toThrow();
  });
});

describe("RLS isolation — admissions", () => {
  it("cannot read enquiries from another tenant", async () => {
    const enquiries = await withTenant(tenantId2, async (tx) => {
      return tx.enquiry.findMany({ where: { tenantId } });
    });
    expect(enquiries.length).toBe(0);
  });

  it("cannot read applications from another tenant", async () => {
    const apps = await withTenant(tenantId2, async (tx) => {
      return tx.admissionApplication.findMany({ where: { tenantId } });
    });
    expect(apps.length).toBe(0);
  });
});
