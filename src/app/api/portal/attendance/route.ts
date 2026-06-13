import { handler, ok, ApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { requireParent, requireStudent } from "@/lib/portal";
import { withTenant } from "@/lib/db";
import { pagination } from "@/lib/tenant";

/**
 * GET /api/portal/attendance?student=<publicId>&page=&pageSize=
 * Parent: must own the child. Student: sees own records.
 */
export const GET = handler(async (req: Request) => {
  const session = await requireRole("parent", "student");
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);

  let tenantId: bigint;
  let studentId: bigint;

  if (session.roles.includes("parent")) {
    const parent = await requireParent();
    tenantId = parent.tenantId;
    const studentPubId = url.searchParams.get("student");
    if (!studentPubId) throw new ApiError("MISSING_STUDENT", "student query param required", 400);

    const student = await withTenant(tenantId, (tx) =>
      tx.student.findFirst({
        where: { tenantId, publicId: studentPubId, deletedAt: null },
        select: { id: true, guardians: { where: { guardianId: parent.guardianId } } },
      }),
    );
    if (!student || student.guardians.length === 0)
      throw new ApiError("FORBIDDEN", "This student is not linked to your account", 403);
    studentId = student.id;
  } else {
    const stu = await requireStudent();
    tenantId = stu.tenantId;
    studentId = stu.studentId;
  }

  const result = await withTenant(tenantId, async (tx) => {
    const where = { studentId, tenantId };
    const [records, total] = await Promise.all([
      tx.attendanceRecord.findMany({
        where,
        orderBy: { date: "desc" },
        skip,
        take: pageSize,
        select: {
          publicId: true,
          date: true,
          status: true,
          source: true,
          firstTapAt: true,
          section: {
            select: { name: true, class: { select: { name: true } } },
          },
        },
      }),
      tx.attendanceRecord.count({ where }),
    ]);
    return { records, total };
  });

  return ok(result.records, { page, pageSize, total: result.total });
});
