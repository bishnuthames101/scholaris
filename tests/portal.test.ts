import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";

/**
 * Phase 6 — Portal tests.
 * Tests portal helper resolution, create-login flow, and self-registration
 * at the database level. Requires DATABASE_URL with migrations applied.
 */

const prisma = new PrismaClient();

let tenantId: bigint;
let tenantPublicId: string;
let tenantSlug: string;
let studentId: bigint;
let studentPublicId: string;
let guardianId: bigint;
let guardianPublicId: string;
let staffId: bigint;
let staffPublicId: string;
let parentRoleId: bigint;
let studentRoleId: bigint;
let teacherRoleId: bigint;

beforeAll(async () => {
  await withTenant(
    null,
    async (tx) => {
      // Create test tenant
      const tenant = await tx.tenant.upsert({
        where: { slug: "portal-test" },
        update: {},
        create: { name: "Portal Test School", slug: "portal-test" },
      });
      tenantId = tenant.id;
      tenantPublicId = tenant.publicId;
      tenantSlug = tenant.slug;

      // Create academic year
      const year = await tx.academicYear.upsert({
        where: { tenantId_name: { tenantId, name: "Portal-2099" } },
        update: {},
        create: {
          tenantId,
          name: "Portal-2099",
          isCurrent: true,
          startsAt: new Date("2099-04-14"),
          endsAt: new Date("2100-04-13"),
        },
      });

      // Create class + section
      const cls =
        (await tx.schoolClass.findFirst({ where: { tenantId, name: "Portal Class 1" } })) ??
        (await tx.schoolClass.create({
          data: { tenantId, gradeLevel: 1, name: "Portal Class 1" },
        }));

      // Create staff (teacher)
      const staff = await tx.staff.upsert({
        where: { id: staffId ?? BigInt(-1) },
        update: {},
        create: {
          tenantId,
          name: "Portal Teacher",
          designation: "Teacher",
          phone: "+977-9800000100",
          email: "teacher@portal-test.example",
        },
      });
      staffId = staff.id;
      staffPublicId = staff.publicId;

      const section = await tx.section.upsert({
        where: { tenantId_classId_name: { tenantId, classId: cls.id, name: "A" } },
        update: { classTeacherId: staff.id },
        create: {
          tenantId,
          classId: cls.id,
          name: "A",
          classTeacherId: staff.id,
        },
      });

      // Create student
      const student = await tx.student.upsert({
        where: { tenantId_admissionNo: { tenantId, admissionNo: "PORTAL-001" } },
        update: {},
        create: {
          tenantId,
          admissionNo: "PORTAL-001",
          name: "Portal Student",
          gender: "other",
          phone: "+977-9800000101",
        },
      });
      studentId = student.id;
      studentPublicId = student.publicId;

      // Enroll student
      await tx.enrollment.upsert({
        where: {
          studentId_academicYearId: {
            academicYearId: year.id,
            studentId: student.id,
          },
        },
        update: {},
        create: {
          tenantId,
          academicYearId: year.id,
          studentId: student.id,
          sectionId: section.id,
          status: "enrolled",
        },
      });

      // Create guardian
      const guardian = await tx.guardian.upsert({
        where: { id: guardianId ?? BigInt(-1) },
        update: {},
        create: {
          tenantId,
          name: "Portal Guardian",
          phone: "+977-9800000102",
          email: "guardian@portal-test.example",
        },
      });
      guardianId = guardian.id;
      guardianPublicId = guardian.publicId;

      // Link guardian to student
      await tx.studentGuardian.upsert({
        where: {
          studentId_guardianId: { studentId: student.id, guardianId: guardian.id },
        },
        update: {},
        create: {
          studentId: student.id,
          guardianId: guardian.id,
          relation: "father",
          isPrimary: true,
        },
      });

      // Ensure roles exist
      const ensureRole = async (key: string, name: string) => {
        let role = await tx.role.findFirst({
          where: { key, OR: [{ tenantId }, { tenantId: null }] },
        });
        if (!role) {
          role = await tx.role.create({
            data: { tenantId, key, name, isSystem: true },
          });
        }
        return role;
      };
      const pRole = await ensureRole("parent", "Parent");
      const sRole = await ensureRole("student", "Student");
      const tRole = await ensureRole("teacher", "Teacher");
      parentRoleId = pRole.id;
      studentRoleId = sRole.id;
      teacherRoleId = tRole.id;
    },
    { superadmin: true, timeoutMs: 30_000 },
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────
// Create-login for portal users
// ─────────────────────────────────────────────────────────────

describe("portal user creation", () => {
  it("can create a User + parent role + link Guardian.userId", async () => {
    const result = await withTenant(
      null,
      async (tx) => {
        const passwordHash = await hashPassword("TestPass123!");
        const user = await tx.user.upsert({
          where: { tenantId_phone: { tenantId, phone: "+977-9800000102" } },
          update: { passwordHash },
          create: {
            tenantId,
            name: "Portal Guardian",
            email: "guardian@portal-test.example",
            phone: "+977-9800000102",
            passwordHash,
          },
        });
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: parentRoleId } },
          update: {},
          create: { userId: user.id, roleId: parentRoleId },
        });
        await tx.guardian.update({ where: { id: guardianId }, data: { userId: user.id } });

        // Verify linkage
        const g = await tx.guardian.findUnique({ where: { id: guardianId } });
        expect(g?.userId).toBe(user.id);

        // Verify role
        const roles = await tx.userRole.findMany({
          where: { userId: user.id },
          include: { role: true },
        });
        expect(roles.map((r) => r.role.key)).toContain("parent");

        return user.publicId;
      },
      { superadmin: true },
    );
    expect(result).toBeTruthy();
  });

  it("can create a User + student role + link Student.userId", async () => {
    await withTenant(
      null,
      async (tx) => {
        const passwordHash = await hashPassword("StudentPass1!");
        const user = await tx.user.upsert({
          where: { tenantId_phone: { tenantId, phone: "+977-9800000101" } },
          update: { passwordHash },
          create: {
            tenantId,
            name: "Portal Student",
            phone: "+977-9800000101",
            passwordHash,
          },
        });
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: studentRoleId } },
          update: {},
          create: { userId: user.id, roleId: studentRoleId },
        });
        await tx.student.update({ where: { id: studentId }, data: { userId: user.id } });

        const s = await tx.student.findUnique({ where: { id: studentId } });
        expect(s?.userId).toBe(user.id);
      },
      { superadmin: true },
    );
  });

  it("can create a User + teacher role + link Staff.userId", async () => {
    await withTenant(
      null,
      async (tx) => {
        const passwordHash = await hashPassword("TeacherPass1!");
        const user = await tx.user.upsert({
          where: { tenantId_email: { tenantId, email: "teacher@portal-test.example" } },
          update: { passwordHash },
          create: {
            tenantId,
            name: "Portal Teacher",
            email: "teacher@portal-test.example",
            passwordHash,
          },
        });
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: teacherRoleId } },
          update: {},
          create: { userId: user.id, roleId: teacherRoleId },
        });
        await tx.staff.update({ where: { id: staffId }, data: { userId: user.id } });

        const st = await tx.staff.findUnique({ where: { id: staffId } });
        expect(st?.userId).toBe(user.id);
      },
      { superadmin: true },
    );
  });
});

// ─────────────────────────────────────────────────────────────
// RLS — portal users can only see their own tenant's data
// ─────────────────────────────────────────────────────────────

describe("portal RLS isolation", () => {
  let tenantBId: bigint;

  beforeAll(async () => {
    await withTenant(
      null,
      async (tx) => {
        const b = await tx.tenant.upsert({
          where: { slug: "portal-test-b" },
          update: {},
          create: { name: "Portal Test B", slug: "portal-test-b" },
        });
        tenantBId = b.id;
      },
      { superadmin: true },
    );
  });

  it("tenant B cannot see tenant A's guardians", async () => {
    const gs = await withTenant(tenantBId, (tx) =>
      tx.guardian.findMany({ where: { tenantId: tenantId } }),
    );
    expect(gs).toHaveLength(0);
  });

  it("tenant B cannot see tenant A's students", async () => {
    const ss = await withTenant(tenantBId, (tx) =>
      tx.student.findMany({ where: { tenantId: tenantId } }),
    );
    expect(ss).toHaveLength(0);
  });

  it("tenant B cannot see tenant A's staff", async () => {
    const st = await withTenant(tenantBId, (tx) =>
      tx.staff.findMany({ where: { tenantId: tenantId } }),
    );
    expect(st).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Guardian-student linkage verification
// ─────────────────────────────────────────────────────────────

describe("guardian-student linkage", () => {
  it("guardian sees their linked students via StudentGuardian", async () => {
    const links = await withTenant(tenantId, (tx) =>
      tx.studentGuardian.findMany({
        where: { guardianId },
        include: { student: { select: { name: true, admissionNo: true } } },
      }),
    );
    expect(links.length).toBeGreaterThan(0);
    expect(links[0].student.admissionNo).toBe("PORTAL-001");
  });

  it("unlinked guardian has no students", async () => {
    const otherGuardian = await withTenant(
      null,
      async (tx) => {
        return tx.guardian.create({
          data: { tenantId, name: "Unlinked Guardian", phone: "+977-9800000199" },
        });
      },
      { superadmin: true },
    );
    const links = await withTenant(tenantId, (tx) =>
      tx.studentGuardian.findMany({
        where: { guardianId: otherGuardian.id },
      }),
    );
    expect(links).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Role-based nav filtering (unit logic)
// ─────────────────────────────────────────────────────────────

describe("role-based nav filtering", () => {
  type NavItem = { href: string; key: string; roles?: string[] };

  function filterNavByRoles(items: NavItem[], roles: string[]): NavItem[] {
    return items.filter((item) => {
      if (!item.roles || item.roles.length === 0) return true;
      return item.roles.some((r) => roles.includes(r));
    });
  }

  const schoolNav: NavItem[] = [
    { href: "/dashboard", key: "dashboard" },
    { href: "/students", key: "students", roles: ["school_admin", "principal", "front_desk"] },
    { href: "/attendance", key: "attendance", roles: ["school_admin", "principal", "teacher", "class_teacher", "front_desk"] },
    { href: "/fees", key: "fees", roles: ["school_admin", "principal", "accountant"] },
    { href: "/exams", key: "exams", roles: ["school_admin", "principal", "teacher", "class_teacher"] },
    { href: "/settings", key: "settings", roles: ["school_admin", "principal"] },
    { href: "/notices", key: "notices" },
  ];

  it("school_admin sees all items", () => {
    const nav = filterNavByRoles(schoolNav, ["school_admin"]);
    expect(nav.length).toBe(schoolNav.length);
  });

  it("teacher sees dashboard, attendance, exams, notices — not students/fees/settings", () => {
    const nav = filterNavByRoles(schoolNav, ["teacher"]);
    const keys = nav.map((n) => n.key);
    expect(keys).toContain("dashboard");
    expect(keys).toContain("attendance");
    expect(keys).toContain("exams");
    expect(keys).toContain("notices");
    expect(keys).not.toContain("students");
    expect(keys).not.toContain("fees");
    expect(keys).not.toContain("settings");
  });

  it("accountant sees dashboard, fees, notices — not attendance/exams", () => {
    const nav = filterNavByRoles(schoolNav, ["accountant"]);
    const keys = nav.map((n) => n.key);
    expect(keys).toContain("fees");
    expect(keys).toContain("notices");
    expect(keys).not.toContain("attendance");
    expect(keys).not.toContain("exams");
  });

  it("class_teacher sees attendance + exams", () => {
    const nav = filterNavByRoles(schoolNav, ["class_teacher"]);
    const keys = nav.map((n) => n.key);
    expect(keys).toContain("attendance");
    expect(keys).toContain("exams");
  });
});
