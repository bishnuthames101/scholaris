import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

type Ctx = { params: Promise<{ id: string }> };

function parseId(id: string): string {
  const r = z.uuid().safeParse(id);
  if (!r.success) throw new ApiError("NOT_FOUND", "Student not found", 404);
  return r.data;
}

/** GET /api/students/[id] — full student profile. */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantSession();
  const id = parseId((await ctx.params).id);

  const student = await withTenant(tenantId, async (tx) => {
    const s = await tx.student.findFirst({
      where: { tenantId, publicId: id, deletedAt: null },
      include: {
        guardians: {
          include: { guardian: true },
        },
        enrollments: {
          where: { deletedAt: null },
          orderBy: { academicYear: { startsAt: "desc" } },
          select: {
            publicId: true,
            rollNo: true,
            status: true,
            enrolledAt: true,
            academicYear: { select: { publicId: true, name: true, isCurrent: true } },
            section: {
              select: {
                publicId: true,
                name: true,
                class: { select: { publicId: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!s) throw new ApiError("NOT_FOUND", "Student not found", 404);
    return s;
  });

  return ok({
    ...student,
    guardians: student.guardians.map((sg) => ({
      relation: sg.relation,
      isPrimary: sg.isPrimary,
      guardian: sg.guardian,
    })),
  });
});

const GenderSchema = z.enum(["male", "female", "other"]);

const UpdateStudentSchema = z
  .object({
    admissionNo: z.string().min(1).max(50),
    name: z.string().min(2).max(200),
    nameNe: z.string().max(200).nullable(),
    gender: GenderSchema,
    dob: z.coerce.date().nullable(),
    address: z.string().max(500).nullable(),
    phone: z.string().regex(/^\+?[0-9\-]{7,20}$/).nullable(),
    bloodGroup: z.string().max(5).nullable(),
    rfidUid: z.string().max(50).nullable(),
    admittedAt: z.coerce.date().nullable(),
  })
  .partial();

/** PATCH /api/students/[id] — partial update of student scalar fields. */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite();
  const id = parseId((await ctx.params).id);
  const body = await parseBody(req, UpdateStudentSchema);

  const updated = await withTenant(tenantId, async (tx) => {
    const existing = await tx.student.findFirst({
      where: { tenantId, publicId: id, deletedAt: null },
    });
    if (!existing) throw new ApiError("NOT_FOUND", "Student not found", 404);

    if (body.admissionNo && body.admissionNo !== existing.admissionNo) {
      const dup = await tx.student.findFirst({
        where: { tenantId, admissionNo: body.admissionNo, id: { not: existing.id } },
        select: { id: true },
      });
      if (dup)
        throw new ApiError(
          "ADMISSION_NO_EXISTS",
          `A student with admission number "${body.admissionNo}" already exists`,
          409,
        );
    }

    const keys = Object.keys(body) as (keyof typeof body)[];
    if (keys.length === 0) return existing;

    const before = Object.fromEntries(keys.map((k) => [k, existing[k]]));
    const student = await tx.student.update({ where: { id: existing.id }, data: body });
    const after = Object.fromEntries(keys.map((k) => [k, student[k]]));

    await audit(tx, {
      tenantId,
      action: "update",
      entity: "students",
      entityId: student.publicId,
      before,
      after,
    });
    return student;
  });

  return ok(updated);
});

/** DELETE /api/students/[id] — soft delete. */
export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite();
  const id = parseId((await ctx.params).id);

  let reason: string | null = null;
  try {
    const json = (await req.json()) as { reason?: unknown };
    if (typeof json?.reason === "string") reason = json.reason;
  } catch {
    // body is optional
  }

  await withTenant(tenantId, async (tx) => {
    const existing = await tx.student.findFirst({
      where: { tenantId, publicId: id, deletedAt: null },
    });
    if (!existing) throw new ApiError("NOT_FOUND", "Student not found", 404);

    await tx.student.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await audit(tx, {
      tenantId,
      action: "soft_delete",
      entity: "students",
      entityId: existing.publicId,
      before: { admissionNo: existing.admissionNo, name: existing.name },
      reason,
    });
  });

  return ok({ deleted: true });
});
