import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { pagination, requireTenantSession, requireTenantWrite } from "@/lib/tenant";

const GenderSchema = z.enum(["male", "female", "other"]);
const StudentStatusSchema = z.enum(["active", "transferred", "graduated", "dropped"]);
const RelationSchema = z.enum([
  "father",
  "mother",
  "grandfather",
  "grandmother",
  "uncle",
  "aunt",
  "brother",
  "sister",
  "other",
]);
const ChannelSchema = z.enum(["whatsapp", "sms", "viber", "push"]);

/** GET /api/students — list students with current-year enrollment. */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);

  const search = url.searchParams.get("search")?.trim() || undefined;
  const sectionPid = url.searchParams.get("sectionId") || undefined;
  const classPid = url.searchParams.get("classId") || undefined;
  const statusRaw = url.searchParams.get("status") || undefined;
  const status = statusRaw ? StudentStatusSchema.parse(statusRaw) : undefined;
  if (sectionPid) z.uuid().parse(sectionPid);
  if (classPid) z.uuid().parse(classPid);

  const result = await withTenant(tenantId, async (tx) => {
    let sectionIds: bigint[] | undefined;
    if (sectionPid) {
      const section = await tx.section.findFirst({
        where: { tenantId, publicId: sectionPid, deletedAt: null },
        select: { id: true },
      });
      if (!section) throw new ApiError("NOT_FOUND", "Section not found", 404);
      sectionIds = [section.id];
    } else if (classPid) {
      const cls = await tx.schoolClass.findFirst({
        where: { tenantId, publicId: classPid, deletedAt: null },
        include: { sections: { where: { deletedAt: null }, select: { id: true } } },
      });
      if (!cls) throw new ApiError("NOT_FOUND", "Class not found", 404);
      sectionIds = cls.sections.map((s) => s.id);
    }

    const where: Prisma.StudentWhereInput = {
      tenantId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { nameNe: { contains: search, mode: "insensitive" } },
              { admissionNo: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(sectionIds
        ? {
            enrollments: {
              some: {
                deletedAt: null,
                sectionId: { in: sectionIds },
                academicYear: { isCurrent: true },
              },
            },
          }
        : {}),
    };

    const total = await tx.student.count({ where });
    const students = await tx.student.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take: pageSize,
      include: {
        enrollments: {
          where: { deletedAt: null, academicYear: { isCurrent: true } },
          select: {
            publicId: true,
            rollNo: true,
            status: true,
            section: {
              select: {
                publicId: true,
                name: true,
                class: { select: { publicId: true, name: true, gradeLevel: true } },
              },
            },
          },
        },
      },
    });
    return { total, students };
  });

  const data = result.students.map(({ enrollments, ...student }) => ({
    ...student,
    currentEnrollment: enrollments[0] ?? null,
  }));

  return ok(data, { page, pageSize, total: result.total });
});

const GuardianInputSchema = z.object({
  name: z.string().min(2).max(200),
  phone: z.string().regex(/^\+?[0-9\-]{7,20}$/),
  relation: RelationSchema,
  isPrimary: z.boolean().optional(),
  email: z.email().optional(),
  preferredChannel: ChannelSchema.optional(),
});

const CreateStudentSchema = z.object({
  admissionNo: z.string().min(1).max(50),
  name: z.string().min(2).max(200),
  nameNe: z.string().max(200).optional(),
  gender: GenderSchema,
  dob: z.coerce.date().optional(),
  address: z.string().max(500).optional(),
  phone: z.string().regex(/^\+?[0-9\-]{7,20}$/).optional(),
  bloodGroup: z.string().max(5).optional(),
  rfidUid: z.string().max(50).optional(),
  admittedAt: z.coerce.date().optional(),
  sectionId: z.uuid().optional(),
  rollNo: z.number().int().optional(),
  guardians: z.array(GuardianInputSchema).max(10).optional(),
});

/** POST /api/students — create a student (+ optional enrollment + guardians). */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite();
  const body = await parseBody(req, CreateStudentSchema);

  const result = await withTenant(tenantId, async (tx) => {
    const dup = await tx.student.findFirst({
      where: { tenantId, admissionNo: body.admissionNo },
      select: { id: true },
    });
    if (dup)
      throw new ApiError(
        "ADMISSION_NO_EXISTS",
        `A student with admission number "${body.admissionNo}" already exists`,
        409,
      );

    const student = await tx.student.create({
      data: {
        tenantId,
        admissionNo: body.admissionNo,
        name: body.name,
        nameNe: body.nameNe,
        gender: body.gender,
        dob: body.dob,
        address: body.address,
        phone: body.phone,
        bloodGroup: body.bloodGroup,
        rfidUid: body.rfidUid,
        admittedAt: body.admittedAt,
      },
    });
    await audit(tx, {
      tenantId,
      action: "create",
      entity: "students",
      entityId: student.publicId,
      after: { admissionNo: student.admissionNo, name: student.name, gender: student.gender },
    });

    let enrollment = null;
    if (body.sectionId) {
      const currentYear = await tx.academicYear.findFirst({
        where: { tenantId, isCurrent: true, deletedAt: null },
      });
      if (!currentYear)
        throw new ApiError("NO_CURRENT_YEAR", "No current academic year is configured", 409);
      const section = await tx.section.findFirst({
        where: { tenantId, publicId: body.sectionId, deletedAt: null },
      });
      if (!section) throw new ApiError("NOT_FOUND", "Section not found", 404);

      enrollment = await tx.enrollment.create({
        data: {
          tenantId,
          studentId: student.id,
          academicYearId: currentYear.id,
          sectionId: section.id,
          rollNo: body.rollNo,
        },
      });
      await audit(tx, {
        tenantId,
        action: "create",
        entity: "enrollments",
        entityId: enrollment.publicId,
        after: {
          studentId: student.publicId,
          academicYearId: currentYear.publicId,
          sectionId: section.publicId,
          rollNo: enrollment.rollNo,
        },
      });
    }

    const guardians = [];
    for (const g of body.guardians ?? []) {
      let guardian = await tx.guardian.findFirst({
        where: { tenantId, phone: g.phone, name: g.name, deletedAt: null },
      });
      if (!guardian) {
        guardian = await tx.guardian.create({
          data: {
            tenantId,
            name: g.name,
            phone: g.phone,
            email: g.email,
            preferredChannel: g.preferredChannel,
          },
        });
        await audit(tx, {
          tenantId,
          action: "create",
          entity: "guardians",
          entityId: guardian.publicId,
          after: { name: guardian.name, phone: guardian.phone },
        });
      }
      await tx.studentGuardian.create({
        data: {
          studentId: student.id,
          guardianId: guardian.id,
          relation: g.relation,
          isPrimary: g.isPrimary ?? false,
        },
      });
      await audit(tx, {
        tenantId,
        action: "create",
        entity: "student_guardians",
        entityId: student.publicId,
        after: { guardianId: guardian.publicId, relation: g.relation, isPrimary: g.isPrimary ?? false },
      });
      guardians.push({ ...guardian, relation: g.relation, isPrimary: g.isPrimary ?? false });
    }

    return { student, enrollment, guardians };
  });

  return created(result);
});
