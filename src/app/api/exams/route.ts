import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { pagination, requireTenantSession, requireTenantWrite } from "@/lib/tenant";
import { ensureDefaultGradeScale } from "@/lib/exams/scales";
import { EXAM_ADMIN_ROLES } from "@/lib/exams/schemas";

/** GET /api/exams — list exams (filter: ?academicYear=uuid&status=&type=). */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);

  const academicYear = url.searchParams.get("academicYear");
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");

  const where: Prisma.ExamWhereInput = {
    tenantId,
    deletedAt: null,
    ...(academicYear ? { academicYear: { publicId: academicYear } } : {}),
    ...(status === "draft" || status === "published" ? { status } : {}),
    ...(type === "unit" || type === "terminal" || type === "board" ? { type } : {}),
  };

  const [rows, total] = await withTenant(tenantId, (tx) =>
    Promise.all([
      tx.exam.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: pageSize,
        include: {
          academicYear: { select: { publicId: true, name: true } },
          gradeScale: { select: { publicId: true, name: true } },
          _count: {
            select: {
              subjects: { where: { deletedAt: null } },
              marks: true,
              results: true,
            },
          },
        },
      }),
      tx.exam.count({ where }),
    ]),
  );

  return ok(rows, { page, pageSize, total });
});

const CreateExamSchema = z.object({
  name: z.string().min(1).max(120),
  nameNe: z.string().max(120).optional(),
  type: z.enum(["unit", "terminal", "board"]).default("terminal"),
  academicYearId: z.uuid(),
  gradeScaleId: z.uuid().optional(), // defaults to the tenant's default scale
  startsAt: z.iso.date().optional(),
  endsAt: z.iso.date().optional(),
});

/** POST /api/exams — create a draft exam. */
export const POST = handler(async (req: Request) => {
  const { tenantId, session } = await requireTenantWrite(EXAM_ADMIN_ROLES);
  const body = await parseBody(req, CreateExamSchema);

  const exam = await withTenant(tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({
      where: { tenantId, publicId: body.academicYearId, deletedAt: null },
      select: { id: true },
    });
    if (!year) throw new ApiError("NOT_FOUND", "Academic year not found", 404);

    let scaleId: bigint;
    if (body.gradeScaleId) {
      const scale = await tx.gradeScale.findFirst({
        where: { tenantId, publicId: body.gradeScaleId, deletedAt: null },
        select: { id: true },
      });
      if (!scale) throw new ApiError("NOT_FOUND", "Grade scale not found", 404);
      scaleId = scale.id;
    } else {
      scaleId = (await ensureDefaultGradeScale(tx, tenantId)).id;
    }

    const dup = await tx.exam.findFirst({
      where: { tenantId, academicYearId: year.id, name: body.name, deletedAt: null },
      select: { id: true },
    });
    if (dup)
      throw new ApiError("DUPLICATE", "An exam with this name already exists in this year", 409);

    const row = await tx.exam.create({
      data: {
        tenantId,
        academicYearId: year.id,
        gradeScaleId: scaleId,
        name: body.name,
        nameNe: body.nameNe ?? null,
        type: body.type,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
      },
      include: {
        academicYear: { select: { publicId: true, name: true } },
        gradeScale: { select: { publicId: true, name: true } },
      },
    });

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "exams",
      entityId: row.publicId,
      after: { name: row.name, type: row.type },
      reason: `Created by ${session.sub}`,
    });

    return row;
  });

  return created(exam);
});
