import { z } from "zod";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

/** GET /api/classes — list classes with sections and counts. */
export const GET = handler(async () => {
  const { tenantId } = await requireTenantSession();

  const classes = await withTenant(tenantId, async (tx) => {
    const currentYear = await tx.academicYear.findFirst({
      where: { tenantId, isCurrent: true, deletedAt: null },
    });

    const enrollmentFilter = {
      deletedAt: null,
      ...(currentYear ? { academicYearId: currentYear.id } : {}),
    };

    return tx.schoolClass.findMany({
      where: { deletedAt: null },
      orderBy: { gradeLevel: "asc" },
      include: {
        sections: {
          where: { deletedAt: null },
          orderBy: { name: "asc" },
          include: {
            classTeacher: { select: { publicId: true, name: true } },
            _count: { select: { enrollments: { where: enrollmentFilter } } },
          },
        },
        _count: { select: { subjects: { where: { deletedAt: null } } } },
      },
    });
  });

  return ok(classes);
});

const StreamEnum = z.enum(["science", "management", "humanities", "education"]);

const CreateClassSchema = z
  .object({
    gradeLevel: z.number().int().min(-1).max(12),
    stream: StreamEnum.optional(),
    name: z.string().min(1).max(200),
    nameNe: z.string().max(200).optional(),
  })
  .refine((b) => !b.stream || b.gradeLevel === 11 || b.gradeLevel === 12, {
    message: "Stream is only allowed for grades 11 and 12",
    path: ["stream"],
  });

/** POST /api/classes — create a class. */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite();
  const body = await parseBody(req, CreateClassSchema);

  const schoolClass = await withTenant(tenantId, async (tx) => {
    const existing = await tx.schoolClass.findFirst({
      where: { tenantId, gradeLevel: body.gradeLevel, stream: body.stream ?? null },
    });
    if (existing)
      throw new ApiError(
        "CLASS_EXISTS",
        "A class with this grade level and stream already exists",
        409,
      );

    const row = await tx.schoolClass.create({
      data: {
        tenantId,
        gradeLevel: body.gradeLevel,
        stream: body.stream,
        name: body.name,
        nameNe: body.nameNe,
      },
    });

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "classes",
      entityId: row.publicId,
      after: {
        gradeLevel: row.gradeLevel,
        stream: row.stream,
        name: row.name,
        nameNe: row.nameNe,
      },
    });

    return row;
  });

  return created(schoolClass);
});
