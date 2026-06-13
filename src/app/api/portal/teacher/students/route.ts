import { handler, ok, ApiError } from "@/lib/api";
import { requireTeacher } from "@/lib/portal";
import { withTenant } from "@/lib/db";

/**
 * GET /api/portal/teacher/students?section=<publicId>
 * List students enrolled in a section the teacher manages.
 */
export const GET = handler(async (req: Request) => {
  const { tenantId, staffId } = await requireTeacher();
  const url = new URL(req.url);
  const sectionPubId = url.searchParams.get("section");
  if (!sectionPubId) throw new ApiError("MISSING_SECTION", "section query param required", 400);

  const students = await withTenant(tenantId, async (tx) => {
    // Verify this teacher owns the section
    const section = await tx.section.findFirst({
      where: { tenantId, publicId: sectionPubId, classTeacherId: staffId, deletedAt: null },
      select: { id: true },
    });
    if (!section)
      throw new ApiError("FORBIDDEN", "You are not the class teacher for this section", 403);

    const enrollments = await tx.enrollment.findMany({
      where: {
        tenantId,
        sectionId: section.id,
        deletedAt: null,
        academicYear: { isCurrent: true },
        student: { status: "active", deletedAt: null },
      },
      select: {
        student: {
          select: {
            publicId: true,
            name: true,
            nameNe: true,
            admissionNo: true,
            photoUrl: true,
            phone: true,
            guardians: {
              select: {
                isPrimary: true,
                relation: true,
                guardian: {
                  select: { name: true, phone: true },
                },
              },
            },
          },
        },
      },
      orderBy: { student: { name: "asc" } },
    });

    return enrollments.map((e) => ({
      ...e.student,
      guardians: e.student.guardians.map((g) => ({
        name: g.guardian.name,
        phone: g.guardian.phone,
        relation: g.relation,
        isPrimary: g.isPrimary,
      })),
    }));
  });

  return ok(students);
});
