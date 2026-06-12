import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../src/lib/db";

/**
 * Phase 4 RLS coverage: exams / grade_scales / marks tenant isolation and the
 * marks no-hard-delete policy. Requires DATABASE_URL with migrations + RLS
 * applied (npm run db:rls), same as tenant-isolation.test.ts.
 *
 * NOTE: marks can never be hard-deleted (RESTRICTIVE no_delete policy, even
 * for superadmin) so all fixtures are upserted by stable unique keys and left
 * in place — re-runs stay idempotent.
 */

const prisma = new PrismaClient();

let tenantAId: bigint;
let tenantBId: bigint;
let markId: bigint;

beforeAll(async () => {
  await withTenant(
    null,
    async (tx) => {
      const a = await tx.tenant.upsert({
        where: { slug: "exam-rls-a" },
        update: {},
        create: { name: "Exam RLS Test A", slug: "exam-rls-a" },
      });
      const b = await tx.tenant.upsert({
        where: { slug: "exam-rls-b" },
        update: {},
        create: { name: "Exam RLS Test B", slug: "exam-rls-b" },
      });
      tenantAId = a.id;
      tenantBId = b.id;

      // Tenant A fixture chain: year → scale → class → subject → exam →
      // exam subject → student → mark.
      const year = await tx.academicYear.upsert({
        where: { tenantId_name: { tenantId: a.id, name: "RLS-2099" } },
        update: {},
        create: {
          tenantId: a.id,
          name: "RLS-2099",
          startsAt: new Date("2099-04-14"),
          endsAt: new Date("2100-04-13"),
        },
      });
      const scale = await tx.gradeScale.upsert({
        where: { tenantId_name: { tenantId: a.id, name: "RLS Test Scale" } },
        update: {},
        create: {
          tenantId: a.id,
          name: "RLS Test Scale",
          bands: {
            create: [
              { tenantId: a.id, letter: "P", gradePoint: 4, minPercent: 35, maxPercent: 100, isPassing: true, sortOrder: 0 },
              { tenantId: a.id, letter: "NG", gradePoint: 0, minPercent: 0, maxPercent: 35, isPassing: false, sortOrder: 1 },
            ],
          },
        },
      });
      // Class unique key includes nullable stream → find-or-create by name.
      const cls =
        (await tx.schoolClass.findFirst({ where: { tenantId: a.id, name: "RLS Class 99" } })) ??
        (await tx.schoolClass.create({
          data: { tenantId: a.id, gradeLevel: 99, name: "RLS Class 99" },
        }));
      const subject = await tx.subject.upsert({
        where: { tenantId_classId_name: { tenantId: a.id, classId: cls.id, name: "RLS Subject" } },
        update: {},
        create: { tenantId: a.id, classId: cls.id, name: "RLS Subject" },
      });
      const exam = await tx.exam.upsert({
        where: {
          tenantId_academicYearId_name: {
            tenantId: a.id,
            academicYearId: year.id,
            name: "RLS Terminal Exam",
          },
        },
        update: {},
        create: {
          tenantId: a.id,
          academicYearId: year.id,
          gradeScaleId: scale.id,
          name: "RLS Terminal Exam",
        },
      });
      const examSubject = await tx.examSubject.upsert({
        where: { examId_subjectId: { examId: exam.id, subjectId: subject.id } },
        update: {},
        create: {
          tenantId: a.id,
          examId: exam.id,
          classId: cls.id,
          subjectId: subject.id,
          fullMarksTh: 100,
          passMarksTh: 35,
        },
      });
      const student = await tx.student.upsert({
        where: { tenantId_admissionNo: { tenantId: a.id, admissionNo: "RLS-001" } },
        update: {},
        create: { tenantId: a.id, admissionNo: "RLS-001", name: "RLS Student", gender: "other" },
      });
      const mark = await tx.mark.upsert({
        where: {
          examSubjectId_studentId: { examSubjectId: examSubject.id, studentId: student.id },
        },
        update: { marksTh: 72 },
        create: {
          tenantId: a.id,
          examId: exam.id,
          examSubjectId: examSubject.id,
          studentId: student.id,
          marksTh: 72,
        },
      });
      markId = mark.id;
    },
    { superadmin: true, timeoutMs: 30_000 },
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("RLS — Phase 4 exams & grading tables", () => {
  it("tenant A sees its grade scale; tenant B does not", async () => {
    const mine = await withTenant(tenantAId, (tx) =>
      tx.gradeScale.findMany({ where: { name: "RLS Test Scale" } }),
    );
    expect(mine).toHaveLength(1);
    const theirs = await withTenant(tenantBId, (tx) =>
      tx.gradeScale.findMany({ where: { name: "RLS Test Scale" } }),
    );
    expect(theirs).toHaveLength(0);
  });

  it("tenant B cannot see tenant A's exams, exam subjects, or marks", async () => {
    const [exams, examSubjects, marks] = await withTenant(tenantBId, (tx) =>
      Promise.all([
        tx.exam.findMany({ where: { name: "RLS Terminal Exam" } }),
        tx.examSubject.findMany({ where: { tenantId: tenantAId } }),
        tx.mark.findMany({ where: { id: markId } }),
      ]),
    );
    expect(exams).toHaveLength(0);
    expect(examSubjects).toHaveLength(0);
    expect(marks).toHaveLength(0);
  });

  it("tenant B cannot see tenant A's grade bands", async () => {
    const bands = await withTenant(tenantBId, (tx) =>
      tx.gradeBand.findMany({ where: { tenantId: tenantAId } }),
    );
    expect(bands).toHaveLength(0);
  });

  it("tenant A cannot create a grade scale for tenant B (WITH CHECK)", async () => {
    await expect(
      withTenant(tenantAId, (tx) =>
        tx.gradeScale.create({ data: { tenantId: tenantBId, name: "Sneaky Scale" } }),
      ),
    ).rejects.toThrow();
  });

  it("marks cannot be hard-deleted, even by the owning tenant", async () => {
    const res = await withTenant(tenantAId, (tx) =>
      tx.mark.deleteMany({ where: { id: markId } }),
    );
    expect(res.count).toBe(0);
    const still = await withTenant(tenantAId, (tx) =>
      tx.mark.findUnique({ where: { id: markId } }),
    );
    expect(still).not.toBeNull();
  });

  it("marks cannot be hard-deleted by superadmin either", async () => {
    const res = await withTenant(
      null,
      (tx) => tx.mark.deleteMany({ where: { id: markId } }),
      { superadmin: true },
    );
    expect(res.count).toBe(0);
  });
});
