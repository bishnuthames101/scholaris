import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Seed uses the DIRECT connection (no pgbouncer) and runs inside a single
// transaction with the superadmin GUC set, so FORCE RLS allows the writes.
const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** System roles (§5.5) — tenant_id NULL → shared across all tenants. */
const SYSTEM_ROLES = [
  { key: "school_admin", name: "School Admin", nameNe: "विद्यालय प्रशासक" },
  { key: "principal", name: "Principal", nameNe: "प्रधानाध्यापक" },
  { key: "accountant", name: "Accountant", nameNe: "लेखापाल" },
  { key: "teacher", name: "Teacher", nameNe: "शिक्षक" },
  { key: "class_teacher", name: "Class Teacher", nameNe: "कक्षा शिक्षक" },
  { key: "parent", name: "Parent", nameNe: "अभिभावक" },
  { key: "student", name: "Student", nameNe: "विद्यार्थी" },
  { key: "librarian", name: "Librarian", nameNe: "पुस्तकालय प्रमुख" },
  { key: "transport", name: "Transport", nameNe: "यातायात" },
  { key: "front_desk", name: "Front Desk", nameNe: "स्वागत कक्ष" },
];

/** Permission matrix seed: action × resource (extend per phase). */
const RESOURCES = [
  "tenants", "users", "students", "guardians", "staff", "classes",
  "attendance", "fees", "invoices", "payments", "exams", "marks",
  "notifications", "notices", "settings", "reports",
];
const ACTIONS = ["read", "create", "update", "delete"];

/** role key → permission keys (wildcards expanded). */
const ROLE_GRANTS: Record<string, string[]> = {
  school_admin: ["*"],
  principal: ["*"],
  accountant: ["students.read", "fees.*", "invoices.*", "payments.*", "reports.read"],
  teacher: ["students.read", "attendance.*", "marks.*", "exams.read", "notices.read", "notices.create"],
  class_teacher: ["students.read", "attendance.*", "marks.*", "exams.read", "notices.*"],
  parent: ["attendance.read", "fees.read", "invoices.read", "exams.read", "marks.read", "notices.read"],
  student: ["attendance.read", "exams.read", "marks.read", "notices.read"],
  librarian: ["students.read"],
  transport: ["students.read"],
  front_desk: ["students.read", "students.create", "guardians.read", "guardians.create"],
};

function expandGrants(grants: string[], allKeys: string[]): string[] {
  const out = new Set<string>();
  for (const g of grants) {
    if (g === "*") allKeys.forEach((k) => out.add(k));
    else if (g.endsWith(".*")) {
      const prefix = g.slice(0, -1); // "fees."
      allKeys.filter((k) => k.startsWith(prefix)).forEach((k) => out.add(k));
    } else out.add(g);
  }
  return [...out];
}

async function seed(tx: Tx, hashes: { superPass: string; demoPass: string }) {
  // 1. Permissions
  const permKeys: string[] = [];
  for (const resource of RESOURCES)
    for (const action of ACTIONS) permKeys.push(`${resource}.${action}`);

  await tx.permission.createMany({
    data: permKeys.map((key) => {
      const [resource, action] = key.split(".");
      return { key, resource, action };
    }),
    skipDuplicates: true,
  });
  console.log(`  ✓ ${permKeys.length} permissions`);

  // 2. System roles + grants
  const allPerms = await tx.permission.findMany();
  const permByKey = new Map(allPerms.map((p) => [p.key, p.id]));

  for (const role of SYSTEM_ROLES) {
    const existing = await tx.role.findFirst({
      where: { key: role.key, tenantId: null, isSystem: true },
    });
    const row =
      existing ?? (await tx.role.create({ data: { ...role, tenantId: null, isSystem: true } }));

    const grantKeys = expandGrants(ROLE_GRANTS[role.key] ?? [], permKeys);
    await tx.rolePermission.createMany({
      data: grantKeys
        .map((k) => permByKey.get(k))
        .filter((id): id is bigint => id !== undefined)
        .map((permissionId) => ({ roleId: row.id, permissionId })),
      skipDuplicates: true,
    });
  }
  console.log(`  ✓ ${SYSTEM_ROLES.length} system roles`);

  // 3. Superadmin (platform owner)
  const superEmail = process.env.SEED_SUPERADMIN_EMAIL ?? "admin@scholaris.app";
  const existingSuper = await tx.user.findFirst({
    where: { email: superEmail, tenantId: null },
  });
  if (!existingSuper) {
    await tx.user.create({
      data: {
        tenantId: null,
        name: "Platform Admin",
        email: superEmail,
        passwordHash: hashes.superPass,
        isSuperadmin: true,
      },
    });
    console.log(`  ✓ superadmin ${superEmail}`);
  } else {
    console.log(`  ✓ superadmin exists`);
  }

  // 4. Default plans (§9)
  const DEFAULT_PLANS = [
    {
      name: "Free",
      nameNe: "निःशुल्क",
      tier: "free" as const,
      description: "For small schools getting started",
      descriptionNe: "सानो विद्यालयका लागि",
      monthlyPricePaisa: 0,
      annualPricePaisa: 0,
      maxStudents: 50,
      maxStaff: 5,
      maxMessagesPerMonth: 100,
      includedCredits: 50,
      modules: ["sis", "attendance", "notices"],
      sortOrder: 0,
      isActive: true,
      isDefault: false,
      trialDays: 0,
    },
    {
      name: "Starter",
      nameNe: "स्टार्टर",
      tier: "starter" as const,
      description: "Essential modules for growing schools",
      descriptionNe: "बढ्दो विद्यालयहरूका लागि",
      monthlyPricePaisa: 99900, // NPR 999
      annualPricePaisa: 999900, // NPR 9,999
      maxStudents: 300,
      maxStaff: 30,
      maxMessagesPerMonth: 1000,
      includedCredits: 200,
      modules: ["sis", "attendance", "fees", "exams", "communication", "notices"],
      sortOrder: 1,
      isActive: true,
      isDefault: true,
      trialDays: 30,
    },
    {
      name: "Professional",
      nameNe: "प्रोफेसनल",
      tier: "professional" as const,
      description: "Full suite for established schools",
      descriptionNe: "स्थापित विद्यालयहरूका लागि पूर्ण सूट",
      monthlyPricePaisa: 249900, // NPR 2,499
      annualPricePaisa: 2499900, // NPR 24,999
      maxStudents: 1000,
      maxStaff: 100,
      maxMessagesPerMonth: 5000,
      includedCredits: 500,
      modules: [
        "sis", "attendance", "fees", "exams", "communication", "notices",
        "timetable", "homework", "library", "transport", "admissions",
      ],
      sortOrder: 2,
      isActive: true,
      isDefault: false,
      trialDays: 30,
    },
    {
      name: "Enterprise",
      nameNe: "इन्टरप्राइज",
      tier: "enterprise" as const,
      description: "Unlimited — for large institutions and chains",
      descriptionNe: "ठूला संस्था र चेनहरूका लागि",
      monthlyPricePaisa: 499900, // NPR 4,999
      annualPricePaisa: 4999900, // NPR 49,999
      maxStudents: 5000,
      maxStaff: 500,
      maxMessagesPerMonth: 20000,
      includedCredits: 2000,
      modules: [
        "sis", "attendance", "fees", "exams", "communication", "notices",
        "timetable", "homework", "library", "transport", "hr", "admissions",
      ],
      sortOrder: 3,
      isActive: true,
      isDefault: false,
      trialDays: 30,
    },
  ];

  for (const plan of DEFAULT_PLANS) {
    await tx.plan.upsert({
      where: { name: plan.name },
      update: {},
      create: plan,
    });
  }
  console.log(`  ✓ ${DEFAULT_PLANS.length} default plans`);

  // 5. Nepal country config
  await tx.countryConfig.upsert({
    where: { code: "NP" },
    update: {},
    create: {
      code: "NP",
      name: "Nepal",
      currency: "NPR",
      currencySymbol: "रू",
      locale: "ne",
      timezone: "Asia/Kathmandu",
      calendarSystem: "bikram_sambat",
      fiscalYearStartMonth: 4,
      defaultGradeScale: "neb_4.0",
      paymentProviders: ["esewa", "khalti", "connectips", "fonepay"],
      taxConfig: { vatRate: 13, panRequired: true, cbmsRequired: false, cbmsThreshold: 10000000 },
    },
  });
  console.log("  ✓ Nepal country config");

  // 6. Demo school + its admin
  const demo = await tx.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Demo Secondary School",
      nameNe: "डेमो माध्यमिक विद्यालय",
      slug: "demo",
      address: "Kathmandu, Nepal",
      status: "trial",
    },
  });

  const adminRole = await tx.role.findFirst({
    where: { key: "school_admin", tenantId: null, isSystem: true },
  });
  const demoAdminEmail = "admin@demo.scholaris.app";
  const existingDemoAdmin = await tx.user.findFirst({
    where: { email: demoAdminEmail, tenantId: demo.id },
  });
  if (!existingDemoAdmin && adminRole) {
    await tx.user.create({
      data: {
        tenantId: demo.id,
        name: "Demo Admin",
        email: demoAdminEmail,
        passwordHash: hashes.demoPass,
        userRoles: { create: { roleId: adminRole.id } },
      },
    });
    console.log(`  ✓ demo school + admin ${demoAdminEmail} (password: Demo1234!)`);
  } else {
    console.log("  ✓ demo school exists");
  }

  // 7. Assign default plan (Starter) to demo school
  const starterPlan = await tx.plan.findFirst({ where: { name: "Starter" } });
  if (starterPlan) {
    const existingSub = await tx.subscription.findUnique({ where: { tenantId: demo.id } });
    if (!existingSub) {
      const now = new Date();
      const trialEnd = new Date(now.getTime() + 30 * 86400000);
      await tx.subscription.create({
        data: {
          tenantId: demo.id,
          planId: starterPlan.id,
          status: "trial",
          billing: "monthly",
          currentPeriodStart: now,
          currentPeriodEnd: trialEnd,
          trialEndsAt: trialEnd,
        },
      });
      console.log("  ✓ demo school subscription (Starter trial, 30 days)");
    } else {
      console.log("  ✓ demo subscription exists");
    }
  }
}

async function main() {
  console.log("Seeding Scholaris…");

  // Hash outside the transaction (bcrypt is slow)
  const superPassPlain = process.env.SEED_SUPERADMIN_PASSWORD ?? "ChangeMe123!";
  const hashes = {
    superPass: await bcrypt.hash(superPassPlain, 11),
    demoPass: await bcrypt.hash("Demo1234!", 11),
  };

  await prisma.$transaction(
    async (tx) => {
      // FORCE RLS applies even to the table owner — flag this session as superadmin.
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.is_superadmin', 'true', true), set_config('app.tenant_id', '', true)`,
      );
      await seed(tx, hashes);
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
