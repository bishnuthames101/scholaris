import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { requireParent, requireStudent } from "@/lib/portal";
import { withTenant } from "@/lib/db";
import { pagination } from "@/lib/tenant";

/**
 * GET — homework visible to the current portal user.
 * Parents see homework for all linked children; students see their own section.
 */
export const GET = handler(async (req: Request) => {
  const session = await requireRole("parent", "student");
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);

  const isParent = session.roles.includes("parent");

  if (isParent) {
    const parent = await requireParent();
    const items = await withTenant(parent.tenantId, async (tx) => {
      // Find children's section IDs
      const links = await tx.studentGuardian.findMany({
        where: { guardianId: parent.guardianId },
        select: {
          student: {
            select: {
              enrollments: {
                where: { deletedAt: null, academicYear: { isCurrent: true } },
                select: { sectionId: true },
                take: 1,
              },
            },
          },
        },
      });
      const sectionIds = links
        .flatMap((l) => l.student.enrollments.map((e) => e.sectionId))
        .filter((v, i, a) => a.indexOf(v) === i);

      if (sectionIds.length === 0) return { items: [], total: 0 };

      const where = { tenantId: parent.tenantId, sectionId: { in: sectionIds }, deletedAt: null, publishedAt: { not: null } };
      const [rows, total] = await Promise.all([
        tx.homework.findMany({
          where,
          orderBy: { dueDate: "desc" },
          skip,
          take: pageSize,
          include: {
            section: { select: { publicId: true, name: true, class: { select: { name: true } } } },
            subject: { select: { publicId: true, name: true, nameNe: true } },
            staff: { select: { name: true } },
          },
        }),
        tx.homework.count({ where }),
      ]);
      return { items: rows, total };
    });

    return ok(items.items, { page, pageSize, total: items.total });
  }

  // Student
  const student = await requireStudent();
  const items = await withTenant(student.tenantId, async (tx) => {
    const enrollment = await tx.enrollment.findFirst({
      where: { tenantId: student.tenantId, studentId: student.studentId, deletedAt: null, academicYear: { isCurrent: true } },
      select: { sectionId: true },
    });
    if (!enrollment) return { items: [], total: 0 };

    const where = {
      tenantId: student.tenantId,
      sectionId: enrollment.sectionId,
      deletedAt: null,
      publishedAt: { not: null },
    };
    const [rows, total] = await Promise.all([
      tx.homework.findMany({
        where,
        orderBy: { dueDate: "desc" },
        skip,
        take: pageSize,
        include: {
          section: { select: { publicId: true, name: true, class: { select: { name: true } } } },
          subject: { select: { publicId: true, name: true, nameNe: true } },
          staff: { select: { name: true } },
          submissions: {
            where: { studentId: student.studentId },
            select: { publicId: true, submittedAt: true, grade: true, comment: true, commentedAt: true },
          },
        },
      }),
      tx.homework.count({ where }),
    ]);
    return { items: rows, total };
  });

  return ok(items.items, { page, pageSize, total: items.total });
});
