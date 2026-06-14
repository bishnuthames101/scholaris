import { z } from "zod";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { pagination, requireTenantWrite } from "@/lib/tenant";

const ADM_ROLES = ["school_admin", "principal", "front_desk"];

const CreateEnquirySchema = z.object({
  studentName: z.string().min(1).max(200),
  studentNameNe: z.string().max(200).optional(),
  guardianName: z.string().min(1).max(200),
  guardianPhone: z.string().regex(/^\+?[0-9\-]{7,20}$/),
  guardianEmail: z.string().email().optional(),
  applyingForClassId: z.string().uuid().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  address: z.string().max(500).optional(),
  source: z.enum(["walk_in", "phone", "website", "referral", "social_media", "other"]).default("walk_in"),
  note: z.string().max(2000).optional(),
});

/** GET /api/admissions/enquiries — list enquiries with filters. */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(ADM_ROLES);
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);
  const status = url.searchParams.get("status")?.trim();
  const search = url.searchParams.get("search")?.trim();

  const result = await withTenant(tenantId, async (tx) => {
    const where: Record<string, unknown> = { tenantId, deletedAt: null };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { studentName: { contains: search, mode: "insensitive" } },
        { guardianName: { contains: search, mode: "insensitive" } },
        { guardianPhone: { contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      tx.enquiry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          applyingForClass: { select: { publicId: true, name: true } },
          _count: { select: { followUps: true } },
        },
      }),
      tx.enquiry.count({ where }),
    ]);
    return { items, total };
  });

  return ok(result.items, { page, pageSize, total: result.total });
});

/** POST /api/admissions/enquiries — create a new enquiry. */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(ADM_ROLES);
  const body = await parseBody(req, CreateEnquirySchema);

  const enquiry = await withTenant(tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({
      where: { tenantId, isCurrent: true, deletedAt: null },
      select: { id: true },
    });
    if (!year) throw new ApiError("NO_ACADEMIC_YEAR", "No current academic year", 400);

    let classId: bigint | undefined;
    if (body.applyingForClassId) {
      const cls = await tx.schoolClass.findFirst({
        where: { tenantId, publicId: body.applyingForClassId, deletedAt: null },
        select: { id: true },
      });
      if (!cls) throw new ApiError("NOT_FOUND", "Class not found", 404);
      classId = cls.id;
    }

    const row = await tx.enquiry.create({
      data: {
        tenantId,
        academicYearId: year.id,
        studentName: body.studentName,
        studentNameNe: body.studentNameNe,
        guardianName: body.guardianName,
        guardianPhone: body.guardianPhone,
        guardianEmail: body.guardianEmail,
        applyingForClassId: classId,
        gender: body.gender,
        address: body.address,
        source: body.source,
        note: body.note,
      },
      include: {
        applyingForClass: { select: { publicId: true, name: true } },
      },
    });

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "enquiry",
      entityId: row.publicId,
      after: { studentName: body.studentName, guardianName: body.guardianName, source: body.source },
    });

    return row;
  });

  return created(enquiry);
});
