import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../src/lib/db";

/**
 * Phase 7 — Homework tests.
 * Tests CRUD, submissions, grading, and RLS isolation.
 */

const prisma = new PrismaClient();

let tenantId: bigint;
let yearId: bigint;
let sectionId: bigint;
let subjectId: bigint;
let staffId: bigint;
let studentId: bigint;
let homeworkId: bigint;

beforeAll(async () => {
  await withTenant(
    null,
    async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { slug: "hw-test" },
        update: {},
        create: { name: "Homework Test School", slug: "hw-test" },
      });
      tenantId = tenant.id;

      const year = await tx.academicYear.upsert({
        where: { tenantId_name: { tenantId, name: "HW-2099" } },
        update: { isCurrent: true },
        create: { tenantId, name: "HW-2099", isCurrent: true, startsAt: new Date("2099-04-14"), endsAt: new Date("2100-04-13") },
      });
      yearId = year.id;

      const cls = (await tx.schoolClass.findFirst({ where: { tenantId, name: "HW Class 1" } })) ??
        (await tx.schoolClass.create({ data: { tenantId, gradeLevel: 1, name: "HW Class 1" } }));

      const sec = await tx.section.upsert({
        where: { tenantId_classId_name: { tenantId, classId: cls.id, name: "A" } },
        update: {},
        create: { tenantId, classId: cls.id, name: "A" },
      });
      sectionId = sec.id;

      const sub = await tx.subject.upsert({
        where: { tenantId_classId_name: { tenantId, classId: cls.id, name: "English" } },
        update: {},
        create: { tenantId, classId: cls.id, name: "English", code: "ENG" },
      });
      subjectId = sub.id;

      const staff = (await tx.staff.findFirst({ where: { tenantId, email: "hw-teacher@test.example" } })) ??
        (await tx.staff.create({ data: { tenantId, name: "HW Teacher", designation: "Teacher", email: "hw-teacher@test.example" } }));
      staffId = staff.id;

      const student = await tx.student.upsert({
        where: { tenantId_admissionNo: { tenantId, admissionNo: "HW-001" } },
        update: {},
        create: { tenantId, admissionNo: "HW-001", name: "HW Student", gender: "other" },
      });
      studentId = student.id;

      // Enroll student
      await tx.enrollment.upsert({
        where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
        update: {},
        create: { tenantId, studentId: student.id, academicYearId: year.id, sectionId: sec.id, status: "enrolled" },
      });
    },
    { superadmin: true, timeoutMs: 30_000 },
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────
// Homework CRUD
// ─────────────────────────────────────────────────────────────

describe("homework CRUD", () => {
  it("can create homework", async () => {
    const hw = await withTenant(tenantId, (tx) =>
      tx.homework.create({
        data: {
          tenantId,
          sectionId,
          subjectId,
          staffId,
          title: "Read Chapter 5",
          description: "Read chapter 5 and answer questions 1-10.",
          dueDate: new Date("2099-07-01"),
          publishedAt: new Date(),
        },
      }),
    );
    homeworkId = hw.id;
    expect(hw.title).toBe("Read Chapter 5");
  });

  it("can list homework for a section", async () => {
    const items = await withTenant(tenantId, (tx) =>
      tx.homework.findMany({
        where: { tenantId, sectionId, deletedAt: null },
        include: { subject: { select: { name: true } }, staff: { select: { name: true } } },
      }),
    );
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].subject.name).toBe("English");
  });
});

// ─────────────────────────────────────────────────────────────
// Submissions + grading
// ─────────────────────────────────────────────────────────────

describe("homework submissions", () => {
  it("student can submit homework", async () => {
    const sub = await withTenant(
      tenantId,
      (tx) => tx.homeworkSubmission.upsert({
        where: { homeworkId_studentId: { homeworkId, studentId } },
        update: { content: "My answers for chapter 5", submittedAt: new Date() },
        create: {
          tenantId,
          homeworkId,
          studentId,
          content: "My answers for chapter 5",
        },
        include: { student: { select: { name: true } } },
      }),
    );
    expect(sub.student.name).toBe("HW Student");
    expect(sub.content).toContain("chapter 5");
  });

  it("teacher can grade a submission", async () => {
    const sub = await withTenant(tenantId, (tx) =>
      tx.homeworkSubmission.findFirst({ where: { tenantId, homeworkId, studentId } }),
    );
    expect(sub).toBeTruthy();

    const graded = await withTenant(tenantId, (tx) =>
      tx.homeworkSubmission.update({
        where: { id: sub!.id },
        data: { grade: "A", comment: "Good work!", commentedAt: new Date() },
      }),
    );
    expect(graded.grade).toBe("A");
    expect(graded.comment).toBe("Good work!");
  });

  it("student sees their submission with grade", async () => {
    const hw = await withTenant(tenantId, (tx) =>
      tx.homework.findFirst({
        where: { id: homeworkId },
        include: {
          submissions: {
            where: { studentId },
            select: { grade: true, comment: true, content: true },
          },
        },
      }),
    );
    expect(hw!.submissions).toHaveLength(1);
    expect(hw!.submissions[0].grade).toBe("A");
  });
});

// ─────────────────────────────────────────────────────────────
// RLS isolation
// ─────────────────────────────────────────────────────────────

describe("homework RLS isolation", () => {
  let otherTenantId: bigint;

  beforeAll(async () => {
    await withTenant(null, async (tx) => {
      const t = await tx.tenant.upsert({ where: { slug: "hw-test-b" }, update: {}, create: { name: "HW Test B", slug: "hw-test-b" } });
      otherTenantId = t.id;
    }, { superadmin: true });
  });

  it("other tenant cannot see homework", async () => {
    const hw = await withTenant(otherTenantId, (tx) =>
      tx.homework.findMany({ where: { tenantId } }),
    );
    expect(hw).toHaveLength(0);
  });

  it("other tenant cannot see submissions", async () => {
    const subs = await withTenant(otherTenantId, (tx) =>
      tx.homeworkSubmission.findMany({ where: { tenantId } }),
    );
    expect(subs).toHaveLength(0);
  });
});
