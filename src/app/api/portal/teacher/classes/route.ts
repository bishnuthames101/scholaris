import { handler, ok } from "@/lib/api";
import { requireTeacher } from "@/lib/portal";
import { withTenant } from "@/lib/db";

/**
 * GET /api/portal/teacher/classes — list classes/sections the teacher is assigned to.
 */
export const GET = handler(async () => {
  const { tenantId, staffId } = await requireTeacher();

  const classes = await withTenant(tenantId, async (tx) => {
    // Sections where this staff is class teacher
    const sections = await tx.section.findMany({
      where: { tenantId, classTeacherId: staffId, deletedAt: null },
      include: {
        class: { select: { publicId: true, name: true, gradeLevel: true } },
        _count: {
          select: {
            enrollments: {
              where: { deletedAt: null, academicYear: { isCurrent: true } },
            },
          },
        },
      },
    });

    return sections.map((s) => ({
      sectionPublicId: s.publicId,
      sectionName: s.name,
      classPublicId: s.class.publicId,
      className: s.class.name,
      gradeLevel: s.class.gradeLevel,
      studentCount: s._count.enrollments,
    }));
  });

  return ok(classes);
});
