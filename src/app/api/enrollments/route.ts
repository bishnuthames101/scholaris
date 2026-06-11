import { z } from "zod";
import { ApiError, created, handler, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

const CreateEnrollmentSchema = z.object({
  studentId: z.uuid(),
  academicYearId: z.uuid(),
  sectionId: z.uuid(),
  rollNo: z.number().int().optional(),
});

/** POST /api/enrollments — enroll a student into a section for an academic year. */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite();
  const body = await parseBody(req, CreateEnrollmentSchema);

  const enrollment = await withTenant(tenantId, async (tx) => {
    const student = await tx.student.findFirst({
      where: { tenantId, publicId: body.studentId, deletedAt: null },
      select: { id: true, publicId: true },
    });
    if (!student) throw new ApiError("NOT_FOUND", "Student not found", 404);

    const year = await tx.academicYear.findFirst({
      where: { tenantId, publicId: body.academicYearId, deletedAt: null },
      select: { id: true, publicId: true, name: true },
    });
    if (!year) throw new ApiError("NOT_FOUND", "Academic year not found", 404);

    const section = await tx.section.findFirst({
      where: { tenantId, publicId: body.sectionId, deletedAt: null },
      select: { id: true, publicId: true, name: true },
    });
    if (!section) throw new ApiError("NOT_FOUND", "Section not found", 404);

    const existing = await tx.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
    });
    if (existing && existing.deletedAt === null)
      throw new ApiError(
        "ALREADY_ENROLLED",
        "Student is already enrolled in this academic year",
        409,
      );

    let row;
    if (existing) {
      // Revive a soft-deleted enrollment for the same student+year.
      row = await tx.enrollment.update({
        where: { id: existing.id },
        data: {
          sectionId: section.id,
          rollNo: body.rollNo ?? null,
          status: "enrolled",
          deletedAt: null,
          enrolledAt: new Date(),
        },
      });
    } else {
      row = await tx.enrollment.create({
        data: {
          tenantId,
          studentId: student.id,
          academicYearId: year.id,
          sectionId: section.id,
          rollNo: body.rollNo,
        },
      });
    }

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "enrollments",
      entityId: row.publicId,
      after: {
        studentId: student.publicId,
        academicYearId: year.publicId,
        sectionId: section.publicId,
        rollNo: row.rollNo,
        status: row.status,
      },
    });

    return row;
  });

  return created(enrollment);
});
