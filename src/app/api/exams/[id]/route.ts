import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";
import { EXAM_ADMIN_ROLES } from "@/lib/exams/schemas";

type Ctx = { params: Promise<{ id: string }> };

async function parseExamId(ctx: Ctx): Promise<string> {
  const idResult = z.uuid().safeParse((await ctx.params).id);
  if (!idResult.success) throw new ApiError("NOT_FOUND", "Exam not found", 404);
  return idResult.data;
}

/** GET /api/exams/[id] — exam detail with subjects + grade scale. */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantSession();
  const publicId = await parseExamId(ctx);

  const exam = await withTenant(tenantId, (tx) =>
    tx.exam.findFirst({
      where: { tenantId, publicId, deletedAt: null },
      include: {
        academicYear: { select: { publicId: true, name: true } },
        gradeScale: {
          select: {
            publicId: true,
            name: true,
            bands: { orderBy: { sortOrder: "asc" } },
          },
        },
        subjects: {
          where: { deletedAt: null },
          orderBy: [{ classId: "asc" }, { id: "asc" }],
          include: {
            class: { select: { publicId: true, name: true, nameNe: true, gradeLevel: true } },
            subject: { select: { publicId: true, name: true, nameNe: true, code: true } },
            _count: { select: { marks: true } },
          },
        },
        _count: { select: { results: true } },
      },
    }),
  );
  if (!exam) throw new ApiError("NOT_FOUND", "Exam not found", 404);

  return ok(exam);
});

const UpdateExamSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  nameNe: z.string().max(120).nullable().optional(),
  type: z.enum(["unit", "terminal", "board"]).optional(),
  startsAt: z.iso.date().nullable().optional(),
  endsAt: z.iso.date().nullable().optional(),
});

/** PATCH /api/exams/[id] — edit exam metadata (draft only). */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite(EXAM_ADMIN_ROLES);
  const publicId = await parseExamId(ctx);
  const body = await parseBody(req, UpdateExamSchema);

  const result = await withTenant(tenantId, async (tx) => {
    const exam = await tx.exam.findFirst({
      where: { tenantId, publicId, deletedAt: null },
      select: { id: true, publicId: true, status: true, name: true, type: true },
    });
    if (!exam) throw new ApiError("NOT_FOUND", "Exam not found", 404);
    if (exam.status === "published")
      throw new ApiError("LOCKED", "Published exams cannot be edited — unlock first", 409);

    const row = await tx.exam.update({
      where: { id: exam.id },
      data: {
        name: body.name ?? undefined,
        nameNe: body.nameNe === undefined ? undefined : body.nameNe,
        type: body.type ?? undefined,
        startsAt:
          body.startsAt === undefined ? undefined : body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt === undefined ? undefined : body.endsAt ? new Date(body.endsAt) : null,
      },
    });

    await audit(tx, {
      tenantId,
      action: "update",
      entity: "exams",
      entityId: exam.publicId,
      before: { name: exam.name, type: exam.type },
      after: { name: row.name, type: row.type },
    });

    return row;
  });

  return ok(result);
});

/** DELETE /api/exams/[id] — soft delete (draft exams with no marks only). */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite(EXAM_ADMIN_ROLES);
  const publicId = await parseExamId(ctx);

  const result = await withTenant(tenantId, async (tx) => {
    const exam = await tx.exam.findFirst({
      where: { tenantId, publicId, deletedAt: null },
      select: {
        id: true,
        publicId: true,
        name: true,
        status: true,
        _count: { select: { marks: true } },
      },
    });
    if (!exam) throw new ApiError("NOT_FOUND", "Exam not found", 404);
    if (exam.status === "published")
      throw new ApiError("LOCKED", "Published exams cannot be deleted", 409);
    if (exam._count.marks > 0)
      throw new ApiError("HAS_MARKS", "Marks have been entered for this exam", 409);

    const row = await tx.exam.update({
      where: { id: exam.id },
      data: { deletedAt: new Date() },
      select: { publicId: true },
    });

    await audit(tx, {
      tenantId,
      action: "soft_delete",
      entity: "exams",
      entityId: exam.publicId,
      before: { name: exam.name },
    });

    return row;
  });

  return ok(result);
});
