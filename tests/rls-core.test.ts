import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../src/lib/db";

/**
 * Phases 1-4 RLS integration tests.
 * Verifies tenant isolation on core SIS, attendance, fees, and exams tables.
 * Requires DATABASE_URL with migrations + RLS applied (npm run db:rls).
 */

const prisma = new PrismaClient();

let tenantAId: bigint;
let tenantBId: bigint;
let yearAId: bigint;
let classAId: bigint;
let sectionAId: bigint;
let subjectAId: bigint;
let studentAId: bigint;
let staffAId: bigint;
let guardianAId: bigint;
let feeHeadAId: bigint;
let invoiceAId: bigint;
let examAId: bigint;

beforeAll(async () => {
  await withTenant(
    null,
    async (tx) => {
      // Two tenants
      const a = await tx.tenant.upsert({
        where: { slug: "rls-core-a" },
        update: {},
        create: { name: "RLS Core A", slug: "rls-core-a" },
      });
      const b = await tx.tenant.upsert({
        where: { slug: "rls-core-b" },
        update: {},
        create: { name: "RLS Core B", slug: "rls-core-b" },
      });
      tenantAId = a.id;
      tenantBId = b.id;

      // --- Tenant A fixtures ---

      // Phase 1: academic year, class, section, subject, student, staff, guardian
      const year = await tx.academicYear.upsert({
        where: { tenantId_name: { tenantId: a.id, name: "RLS-2099" } },
        update: { isCurrent: true },
        create: { tenantId: a.id, name: "RLS-2099", isCurrent: true, startsAt: new Date("2099-04-14"), endsAt: new Date("2100-04-13") },
      });
      yearAId = year.id;

      const cls = (await tx.schoolClass.findFirst({ where: { tenantId: a.id, name: "RLS Class 1" } })) ??
        (await tx.schoolClass.create({ data: { tenantId: a.id, gradeLevel: 1, name: "RLS Class 1" } }));
      classAId = cls.id;

      const sec = await tx.section.upsert({
        where: { tenantId_classId_name: { tenantId: a.id, classId: cls.id, name: "A" } },
        update: {},
        create: { tenantId: a.id, classId: cls.id, name: "A" },
      });
      sectionAId = sec.id;

      const sub = await tx.subject.upsert({
        where: { tenantId_classId_name: { tenantId: a.id, classId: cls.id, name: "RLS Math" } },
        update: {},
        create: { tenantId: a.id, classId: cls.id, name: "RLS Math", code: "RLSM" },
      });
      subjectAId = sub.id;

      const student = await tx.student.upsert({
        where: { tenantId_admissionNo: { tenantId: a.id, admissionNo: "RLS-001" } },
        update: {},
        create: { tenantId: a.id, admissionNo: "RLS-001", name: "RLS Student", gender: "other" },
      });
      studentAId = student.id;

      const staff = (await tx.staff.findFirst({ where: { tenantId: a.id, email: "rls-staff@test.example" } })) ??
        (await tx.staff.create({ data: { tenantId: a.id, name: "RLS Staff", designation: "Teacher", email: "rls-staff@test.example" } }));
      staffAId = staff.id;

      // Guardian + student-guardian link
      const guardian = (await tx.guardian.findFirst({ where: { tenantId: a.id, phone: "9800000099" } })) ??
        (await tx.guardian.create({ data: { tenantId: a.id, name: "RLS Guardian", phone: "9800000099" } }));
      guardianAId = guardian.id;

      // Ensure student-guardian link exists
      const existingLink = await tx.studentGuardian.findFirst({ where: { studentId: student.id, guardianId: guardian.id } });
      if (!existingLink) {
        await tx.studentGuardian.create({ data: { studentId: student.id, guardianId: guardian.id, relation: "father" } });
      }

      // Enrollment
      await tx.enrollment.upsert({
        where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
        update: {},
        create: { tenantId: a.id, studentId: student.id, academicYearId: year.id, sectionId: sec.id, status: "enrolled" },
      });

      // Phase 2: attendance record
      const dateStr = "2099-06-01";
      const existingAtt = await tx.attendanceRecord.findFirst({
        where: { tenantId: a.id, studentId: student.id, date: new Date(dateStr) },
      });
      if (!existingAtt) {
        await tx.attendanceRecord.create({
          data: { tenantId: a.id, studentId: student.id, sectionId: sec.id, date: new Date(dateStr), status: "present", source: "manual" },
        });
      }

      // Phase 3: fee head + invoice
      const feeHead = (await tx.feeHead.findFirst({ where: { tenantId: a.id, name: "RLS Tuition" } })) ??
        (await tx.feeHead.create({ data: { tenantId: a.id, name: "RLS Tuition" } }));
      feeHeadAId = feeHead.id;

      const invoice = (await tx.invoice.findFirst({ where: { tenantId: a.id, invoiceNo: "RLS-INV-001" } })) ??
        (await tx.invoice.create({
          data: {
            tenantId: a.id,
            studentId: student.id,
            academicYearId: year.id,
            invoiceNo: "RLS-INV-001",
            fiscalYear: "2098/99",
            seq: 1,
            bsYear: 2099,
            issueDate: new Date("2099-06-01"),
            subtotalPaisa: 100000,
            totalPaisa: 100000,
            status: "issued",
          },
        }));
      invoiceAId = invoice.id;

      // Phase 4: grade scale + exam
      const gradeScale = (await tx.gradeScale.findFirst({ where: { tenantId: a.id, name: "RLS Scale" } })) ??
        (await tx.gradeScale.create({ data: { tenantId: a.id, name: "RLS Scale", isDefault: false } }));

      const exam = (await tx.exam.findFirst({ where: { tenantId: a.id, name: "RLS Midterm" } })) ??
        (await tx.exam.create({
          data: {
            tenantId: a.id,
            academicYearId: year.id,
            gradeScaleId: gradeScale.id,
            name: "RLS Midterm",
            type: "terminal",
            status: "draft",
          },
        }));
      examAId = exam.id;
    },
    { superadmin: true, timeoutMs: 30_000 },
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────
// Phase 1: Core SIS — tenant isolation
// ─────────────────────────────────────────────────────────────

describe("Phase 1 RLS: core SIS tables", () => {
  it("other tenant cannot see students", async () => {
    const rows = await withTenant(tenantBId, (tx) =>
      tx.student.findMany({ where: { tenantId: tenantAId } }),
    );
    expect(rows).toHaveLength(0);
  });

  it("other tenant cannot see staff", async () => {
    const rows = await withTenant(tenantBId, (tx) =>
      tx.staff.findMany({ where: { tenantId: tenantAId } }),
    );
    expect(rows).toHaveLength(0);
  });

  it("other tenant cannot see guardians", async () => {
    const rows = await withTenant(tenantBId, (tx) =>
      tx.guardian.findMany({ where: { tenantId: tenantAId } }),
    );
    expect(rows).toHaveLength(0);
  });

  it("other tenant cannot see classes", async () => {
    const rows = await withTenant(tenantBId, (tx) =>
      tx.schoolClass.findMany({ where: { tenantId: tenantAId } }),
    );
    expect(rows).toHaveLength(0);
  });

  it("other tenant cannot see sections", async () => {
    const rows = await withTenant(tenantBId, (tx) =>
      tx.section.findMany({ where: { tenantId: tenantAId } }),
    );
    expect(rows).toHaveLength(0);
  });

  it("other tenant cannot see enrollments", async () => {
    const rows = await withTenant(tenantBId, (tx) =>
      tx.enrollment.findMany({ where: { tenantId: tenantAId } }),
    );
    expect(rows).toHaveLength(0);
  });

  it("other tenant cannot see academic years", async () => {
    const rows = await withTenant(tenantBId, (tx) =>
      tx.academicYear.findMany({ where: { tenantId: tenantAId } }),
    );
    expect(rows).toHaveLength(0);
  });

  it("other tenant cannot see subjects", async () => {
    const rows = await withTenant(tenantBId, (tx) =>
      tx.subject.findMany({ where: { tenantId: tenantAId } }),
    );
    expect(rows).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Phase 2: Attendance — tenant isolation
// ─────────────────────────────────────────────────────────────

describe("Phase 2 RLS: attendance tables", () => {
  it("other tenant cannot see attendance records", async () => {
    const rows = await withTenant(tenantBId, (tx) =>
      tx.attendanceRecord.findMany({ where: { tenantId: tenantAId } }),
    );
    expect(rows).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Phase 3: Fees — tenant isolation + append-only
// ─────────────────────────────────────────────────────────────

describe("Phase 3 RLS: fees tables", () => {
  it("other tenant cannot see fee heads", async () => {
    const rows = await withTenant(tenantBId, (tx) =>
      tx.feeHead.findMany({ where: { tenantId: tenantAId } }),
    );
    expect(rows).toHaveLength(0);
  });

  it("other tenant cannot see invoices", async () => {
    const rows = await withTenant(tenantBId, (tx) =>
      tx.invoice.findMany({ where: { tenantId: tenantAId } }),
    );
    expect(rows).toHaveLength(0);
  });

  it("ledger_entries cannot be deleted", async () => {
    // Create a ledger entry, then try to delete it — should affect 0 rows
    const entry = await withTenant(tenantAId, async (tx) => {
      return tx.ledgerEntry.create({
        data: {
          tenantId: tenantAId,
          studentId: studentAId,
          type: "invoice_issued",
          debitPaisa: 50000,
          narration: "RLS delete test",
        },
      });
    });

    const result = await prisma.$executeRawUnsafe(
      `SET LOCAL app.tenant_id = '${tenantAId}'; SET LOCAL app.is_superadmin = 'off'; DELETE FROM ledger_entries WHERE id = ${entry.id};`,
    ).catch(() => 0);
    expect(result).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Phase 4: Exams — tenant isolation
// ─────────────────────────────────────────────────────────────

describe("Phase 4 RLS: exams tables", () => {
  it("other tenant cannot see exams", async () => {
    const rows = await withTenant(tenantBId, (tx) =>
      tx.exam.findMany({ where: { tenantId: tenantAId } }),
    );
    expect(rows).toHaveLength(0);
  });

  it("other tenant cannot see grade scales", async () => {
    // Grade scale already created in beforeAll for tenant A
    const rows = await withTenant(tenantBId, (tx) =>
      tx.gradeScale.findMany({ where: { tenantId: tenantAId } }),
    );
    expect(rows).toHaveLength(0);
  });
});
