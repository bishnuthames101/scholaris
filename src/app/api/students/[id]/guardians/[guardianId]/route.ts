import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

type Ctx = { params: Promise<{ id: string; guardianId: string }> };

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

async function resolveLink(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: bigint,
  studentPid: string,
  guardianPid: string,
) {
  const student = await tx.student.findFirst({
    where: { tenantId, publicId: studentPid, deletedAt: null },
    select: { id: true, publicId: true },
  });
  if (!student) throw new ApiError("NOT_FOUND", "Student not found", 404);
  const guardian = await tx.guardian.findFirst({
    where: { tenantId, publicId: guardianPid, deletedAt: null },
    select: { id: true, publicId: true },
  });
  if (!guardian) throw new ApiError("NOT_FOUND", "Guardian not found", 404);
  const link = await tx.studentGuardian.findUnique({
    where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } },
  });
  if (!link) throw new ApiError("NOT_FOUND", "Guardian is not linked to this student", 404);
  return { student, guardian, link };
}

function parseUuids(id: string, guardianId: string) {
  if (!z.uuid().safeParse(id).success)
    throw new ApiError("NOT_FOUND", "Student not found", 404);
  if (!z.uuid().safeParse(guardianId).success)
    throw new ApiError("NOT_FOUND", "Guardian not found", 404);
}

const UpdateLinkSchema = z.object({
  relation: RelationSchema.optional(),
  isPrimary: z.boolean().optional(),
});

/** PATCH /api/students/[id]/guardians/[guardianId] — update relation/isPrimary on the link. */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite();
  const { id, guardianId } = await ctx.params;
  parseUuids(id, guardianId);
  const body = await parseBody(req, UpdateLinkSchema);

  const result = await withTenant(tenantId, async (tx) => {
    const { student, guardian, link } = await resolveLink(tx, tenantId, id, guardianId);

    if (body.isPrimary === true) {
      await tx.studentGuardian.updateMany({
        where: { studentId: student.id, isPrimary: true, NOT: { guardianId: guardian.id } },
        data: { isPrimary: false },
      });
    }

    const updated = await tx.studentGuardian.update({
      where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } },
      data: {
        ...(body.relation !== undefined ? { relation: body.relation } : {}),
        ...(body.isPrimary !== undefined ? { isPrimary: body.isPrimary } : {}),
      },
    });

    await audit(tx, {
      tenantId,
      action: "update",
      entity: "student_guardians",
      entityId: student.publicId,
      before: { guardianId: guardian.publicId, relation: link.relation, isPrimary: link.isPrimary },
      after: { guardianId: guardian.publicId, relation: updated.relation, isPrimary: updated.isPrimary },
    });

    return { relation: updated.relation, isPrimary: updated.isPrimary };
  });

  return ok(result);
});

/** DELETE /api/students/[id]/guardians/[guardianId] — unlink guardian from student. */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite();
  const { id, guardianId } = await ctx.params;
  parseUuids(id, guardianId);

  await withTenant(tenantId, async (tx) => {
    const { student, guardian, link } = await resolveLink(tx, tenantId, id, guardianId);

    await tx.studentGuardian.delete({
      where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } },
    });

    await audit(tx, {
      tenantId,
      action: "delete",
      entity: "student_guardians",
      entityId: student.publicId,
      before: { guardianId: guardian.publicId, relation: link.relation, isPrimary: link.isPrimary },
      reason: "Guardian unlinked from student",
    });
  });

  return ok({ unlinked: true });
});
