import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../src/lib/db";

/**
 * Phase 7 — Timetable + SubjectTeacher tests.
 * Tests CRUD, clash detection, substitution, and RLS isolation.
 */

const prisma = new PrismaClient();

let tenantId: bigint;
let yearId: bigint;
let classId: bigint;
let sectionAId: bigint;
let sectionBId: bigint;
let subjectId: bigint;
let subject2Id: bigint;
let staffId: bigint;
let staff2Id: bigint;

beforeAll(async () => {
  await withTenant(
    null,
    async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { slug: "tt-test" },
        update: {},
        create: { name: "Timetable Test School", slug: "tt-test" },
      });
      tenantId = tenant.id;

      const year = await tx.academicYear.upsert({
        where: { tenantId_name: { tenantId, name: "TT-2099" } },
        update: { isCurrent: true },
        create: { tenantId, name: "TT-2099", isCurrent: true, startsAt: new Date("2099-04-14"), endsAt: new Date("2100-04-13") },
      });
      yearId = year.id;

      const cls = (await tx.schoolClass.findFirst({ where: { tenantId, name: "TT Class 1" } })) ??
        (await tx.schoolClass.create({ data: { tenantId, gradeLevel: 1, name: "TT Class 1" } }));
      classId = cls.id;

      const secA = await tx.section.upsert({
        where: { tenantId_classId_name: { tenantId, classId, name: "A" } },
        update: {},
        create: { tenantId, classId, name: "A" },
      });
      sectionAId = secA.id;

      const secB = await tx.section.upsert({
        where: { tenantId_classId_name: { tenantId, classId, name: "B" } },
        update: {},
        create: { tenantId, classId, name: "B" },
      });
      sectionBId = secB.id;

      const sub1 = await tx.subject.upsert({
        where: { tenantId_classId_name: { tenantId, classId, name: "Math" } },
        update: {},
        create: { tenantId, classId, name: "Math", code: "MTH" },
      });
      subjectId = sub1.id;

      const sub2 = await tx.subject.upsert({
        where: { tenantId_classId_name: { tenantId, classId, name: "Science" } },
        update: {},
        create: { tenantId, classId, name: "Science", code: "SCI" },
      });
      subject2Id = sub2.id;

      const s1 = (await tx.staff.findFirst({ where: { tenantId, email: "tt-teacher1@test.example" } })) ??
        (await tx.staff.create({ data: { tenantId, name: "TT Teacher 1", designation: "Teacher", email: "tt-teacher1@test.example" } }));
      staffId = s1.id;

      const s2 = (await tx.staff.findFirst({ where: { tenantId, email: "tt-teacher2@test.example" } })) ??
        (await tx.staff.create({ data: { tenantId, name: "TT Teacher 2", designation: "Teacher", email: "tt-teacher2@test.example" } }));
      staff2Id = s2.id;
    },
    { superadmin: true, timeoutMs: 30_000 },
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────
// SubjectTeacher assignment
// ─────────────────────────────────────────────────────────────

describe("subject-teacher assignment", () => {
  it("can assign a teacher to a subject for a section", async () => {
    const st = await withTenant(
      tenantId,
      (tx) => tx.subjectTeacher.upsert({
        where: { tenantId_subjectId_sectionId: { tenantId, subjectId, sectionId: sectionAId } },
        update: { staffId },
        create: { tenantId, subjectId, sectionId: sectionAId, staffId },
        include: { subject: { select: { name: true } }, staff: { select: { name: true } } },
      }),
    );
    expect(st.subject.name).toBe("Math");
    expect(st.staff.name).toBe("TT Teacher 1");
  });

  it("enforces one teacher per subject per section", async () => {
    // Upsert same subject+section with different staff
    const st = await withTenant(
      tenantId,
      (tx) => tx.subjectTeacher.upsert({
        where: { tenantId_subjectId_sectionId: { tenantId, subjectId, sectionId: sectionAId } },
        update: { staffId: staff2Id },
        create: { tenantId, subjectId, sectionId: sectionAId, staffId: staff2Id },
        include: { staff: { select: { name: true } } },
      }),
    );
    expect(st.staff.name).toBe("TT Teacher 2");
  });
});

// ─────────────────────────────────────────────────────────────
// Timetable CRUD + clash detection
// ─────────────────────────────────────────────────────────────

describe("timetable slots", () => {
  it("can create a timetable slot", async () => {
    const slot = await withTenant(
      tenantId,
      (tx) => tx.timetableSlot.upsert({
        where: {
          tenantId_sectionId_academicYearId_dayOfWeek_periodNumber: {
            tenantId, sectionId: sectionAId, academicYearId: yearId, dayOfWeek: 0, periodNumber: 1,
          },
        },
        update: { subjectId, staffId, startTime: "10:00", endTime: "10:45" },
        create: {
          tenantId, academicYearId: yearId, sectionId: sectionAId, subjectId, staffId,
          dayOfWeek: 0, periodNumber: 1, startTime: "10:00", endTime: "10:45",
        },
        include: { subject: { select: { name: true } }, staff: { select: { name: true } } },
      }),
    );
    expect(slot.dayOfWeek).toBe(0);
    expect(slot.periodNumber).toBe(1);
    expect(slot.subject?.name).toBe("Math");
  });

  it("detects teacher clash across sections", async () => {
    // staffId is already assigned to Section A, day 0, period 1
    // Try to assign same staff to Section B, day 0, period 1
    const clash = await withTenant(
      tenantId,
      (tx) => tx.timetableSlot.findFirst({
        where: {
          tenantId,
          academicYearId: yearId,
          staffId,
          dayOfWeek: 0,
          periodNumber: 1,
          NOT: { sectionId: sectionBId },
        },
      }),
    );
    expect(clash).toBeTruthy();
    expect(clash?.sectionId).toBe(sectionAId);
  });

  it("allows different teachers at the same period", async () => {
    const slot = await withTenant(
      tenantId,
      (tx) => tx.timetableSlot.upsert({
        where: {
          tenantId_sectionId_academicYearId_dayOfWeek_periodNumber: {
            tenantId, sectionId: sectionBId, academicYearId: yearId, dayOfWeek: 0, periodNumber: 1,
          },
        },
        update: { subjectId: subject2Id, staffId: staff2Id, startTime: "10:00", endTime: "10:45" },
        create: {
          tenantId, academicYearId: yearId, sectionId: sectionBId, subjectId: subject2Id, staffId: staff2Id,
          dayOfWeek: 0, periodNumber: 1, startTime: "10:00", endTime: "10:45",
        },
      }),
    );
    expect(slot.staffId).toBe(staff2Id);
  });

  it("can create break/assembly slots", async () => {
    const slot = await withTenant(
      tenantId,
      (tx) => tx.timetableSlot.upsert({
        where: {
          tenantId_sectionId_academicYearId_dayOfWeek_periodNumber: {
            tenantId, sectionId: sectionAId, academicYearId: yearId, dayOfWeek: 0, periodNumber: 4,
          },
        },
        update: { slotType: "break_time", startTime: "12:00", endTime: "12:30" },
        create: {
          tenantId, academicYearId: yearId, sectionId: sectionAId,
          dayOfWeek: 0, periodNumber: 4, startTime: "12:00", endTime: "12:30", slotType: "break_time",
        },
      }),
    );
    expect(slot.slotType).toBe("break_time");
    expect(slot.subjectId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// Substitution
// ─────────────────────────────────────────────────────────────

describe("substitution", () => {
  it("can create a substitution for a slot", async () => {
    const slot = await withTenant(tenantId, (tx) =>
      tx.timetableSlot.findFirst({
        where: { tenantId, sectionId: sectionAId, dayOfWeek: 0, periodNumber: 1 },
      }),
    );
    expect(slot).toBeTruthy();

    const sub = await withTenant(
      tenantId,
      (tx) => tx.substitution.upsert({
        where: { timetableSlotId_date: { timetableSlotId: slot!.id, date: new Date("2099-06-15") } },
        update: { substituteStaffId: staff2Id, reason: "Teacher absent" },
        create: {
          tenantId,
          timetableSlotId: slot!.id,
          date: new Date("2099-06-15"),
          substituteStaffId: staff2Id,
          reason: "Teacher absent",
        },
        include: { substituteStaff: { select: { name: true } } },
      }),
    );
    expect(sub.substituteStaff.name).toBe("TT Teacher 2");
    expect(sub.reason).toBe("Teacher absent");
  });
});

// ─────────────────────────────────────────────────────────────
// RLS — cross-tenant isolation
// ─────────────────────────────────────────────────────────────

describe("timetable RLS isolation", () => {
  let otherTenantId: bigint;

  beforeAll(async () => {
    await withTenant(null, async (tx) => {
      const t = await tx.tenant.upsert({ where: { slug: "tt-test-b" }, update: {}, create: { name: "TT Test B", slug: "tt-test-b" } });
      otherTenantId = t.id;
    }, { superadmin: true });
  });

  it("other tenant cannot see timetable slots", async () => {
    const slots = await withTenant(otherTenantId, (tx) =>
      tx.timetableSlot.findMany({ where: { tenantId } }),
    );
    expect(slots).toHaveLength(0);
  });

  it("other tenant cannot see substitutions", async () => {
    const subs = await withTenant(otherTenantId, (tx) =>
      tx.substitution.findMany({ where: { tenantId } }),
    );
    expect(subs).toHaveLength(0);
  });
});
