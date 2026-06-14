import { z } from "zod";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { pagination, requireTenantWrite } from "@/lib/tenant";
import { nextSequences, formatApplicationNo } from "@/lib/fees/numbering";
import { kathmanduDateString, toDbDate } from "@/lib/attendance";
import { fiscalYearLabel } from "@/lib/dates/bs";

const ADM_ROLES = ["school_admin", "principal", "front_desk"];

const CreateApplicationSchema = z.object({
  enquiryId: z.string().uuid().optional(),
  studentName: z.string().min(1).max(200),
  studentNameNe: z.string().max(200).optional(),
  gender: z.enum(["male", "female", "other"]),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
  previousSchool: z.string().max(200).optional(),
  applyingForClassId: z.string().uuid(),
  applyingForSectionId: z.string().uuid().optional(),
  guardianName: z.string().min(1).max(200),
  guardianPhone: z.string().regex(/^\+?[0-9\-]{7,20}$/),
  guardianEmail: z.string().email().optional(),
  guardianRelation: z.enum(["father", "mother", "grandfather", "grandmother", "uncle", "aunt", "brother", "sister", "other"]).optional(),
  feePaisa: z.number().int().min(0).optional(),
});

/** GET /api/admissions/applications — list applications with filters. */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(ADM_ROLES);
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);
  const status = url.searchParams.get("status")?.trim();

  const result = await withTenant(tenantId, async (tx) => {
    const where: Record<string, unknown> = { tenantId, deletedAt: null };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      tx.admissionApplication.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          applyingForClass: { select: { publicId: true, name: true } },
          applyingForSection: { select: { publicId: true, name: true } },
          enquiry: { select: { publicId: true, studentName: true } },
        },
      }),
      tx.admissionApplication.count({ where }),
    ]);
    return { items, total };
  });

  return ok(result.items, { page, pageSize, total: result.total });
});

/** POST /api/admissions/applications — create an application. */
export const POST = handler(async (req: Request) => {
  const { tenantId, session } = await requireTenantWrite(ADM_ROLES);
  const body = await parseBody(req, CreateApplicationSchema);

  const application = await withTenant(tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({
      where: { tenantId, isCurrent: true, deletedAt: null },
      select: { id: true },
    });
    if (!year) throw new ApiError("NO_ACADEMIC_YEAR", "No current academic year", 400);

    const cls = await tx.schoolClass.findFirst({
      where: { tenantId, publicId: body.applyingForClassId, deletedAt: null },
      select: { id: true },
    });
    if (!cls) throw new ApiError("NOT_FOUND", "Class not found", 404);

    let sectionId: bigint | undefined;
    if (body.applyingForSectionId) {
      const sec = await tx.section.findFirst({
        where: { tenantId, publicId: body.applyingForSectionId, classId: cls.id, deletedAt: null },
        select: { id: true },
      });
      if (!sec) throw new ApiError("NOT_FOUND", "Section not found", 404);
      sectionId = sec.id;
    }

    let enquiryId: bigint | undefined;
    if (body.enquiryId) {
      const enq = await tx.enquiry.findFirst({
        where: { tenantId, publicId: body.enquiryId, deletedAt: null },
        select: { id: true },
      });
      if (!enq) throw new ApiError("NOT_FOUND", "Enquiry not found", 404);
      enquiryId = enq.id;

      // Update enquiry status
      await tx.enquiry.update({
        where: { id: enq.id },
        data: { status: "application_sent" },
      });
    }

    const fiscalYear = fiscalYearLabel(toDbDate(kathmanduDateString()));
    const [seq] = await nextSequences(tx, tenantId, "application", fiscalYear, 1);
    const applicationNo = formatApplicationNo(fiscalYear, seq);

    const row = await tx.admissionApplication.create({
      data: {
        tenantId,
        applicationNo,
        fiscalYear,
        seq,
        academicYearId: year.id,
        enquiryId,
        studentName: body.studentName,
        studentNameNe: body.studentNameNe,
        gender: body.gender,
        dob: body.dob ? new Date(body.dob + "T00:00:00.000Z") : null,
        address: body.address,
        phone: body.phone,
        previousSchool: body.previousSchool,
        applyingForClassId: cls.id,
        applyingForSectionId: sectionId,
        guardianName: body.guardianName,
        guardianPhone: body.guardianPhone,
        guardianEmail: body.guardianEmail,
        guardianRelation: body.guardianRelation,
        feePaisa: body.feePaisa,
        status: "submitted",
        createdBy: session.sub,
      },
      include: {
        applyingForClass: { select: { publicId: true, name: true } },
      },
    });

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "admission_application",
      entityId: row.publicId,
      after: { applicationNo, studentName: body.studentName },
    });

    return row;
  });

  return created(application);
});
