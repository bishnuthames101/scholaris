import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";
import { toDbDate } from "@/lib/attendance";

/** Roles allowed to view/mark daily attendance. */
const MARK_ROLES = ["school_admin", "principal", "teacher", "class_teacher", "front_desk"];

const QuerySchema = z.object({
  sectionId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

/** GET /api/attendance?sectionId=&date= — roster of a section with that day's records. */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(MARK_ROLES);
  const url = new URL(req.url);
  const { sectionId, date } = QuerySchema.parse({
    sectionId: url.searchParams.get("sectionId"),
    date: url.searchParams.get("date"),
  });
  const dbDate = toDbDate(date);

  const { section, roster } = await withTenant(tenantId, async (tx) => {
    const section = await tx.section.findFirst({
      where: { tenantId, publicId: sectionId, deletedAt: null },
      select: {
        id: true,
        publicId: true,
        name: true,
        class: { select: { name: true } },
      },
    });
    if (!section) throw new ApiError("NOT_FOUND", "Section not found", 404);

    const year = await tx.academicYear.findFirst({
      where: { tenantId, isCurrent: true, deletedAt: null },
      select: { id: true },
    });
    if (!year)
      throw new ApiError("NO_CURRENT_YEAR", "No current academic year is set", 409);

    const enrollments = await tx.enrollment.findMany({
      where: {
        tenantId,
        sectionId: section.id,
        academicYearId: year.id,
        deletedAt: null,
        student: { status: "active", deletedAt: null },
      },
      select: {
        rollNo: true,
        student: {
          select: { id: true, publicId: true, name: true, nameNe: true, photoUrl: true },
        },
      },
    });

    const studentDbIds = enrollments.map((e) => e.student.id);
    const records =
      studentDbIds.length === 0
        ? []
        : await tx.attendanceRecord.findMany({
            where: { tenantId, date: dbDate, studentId: { in: studentDbIds } },
            select: {
              studentId: true,
              status: true,
              source: true,
              firstTapAt: true,
              lastTapAt: true,
              markedBy: true,
              note: true,
            },
          });

    const recordByStudent = new Map(records.map((r) => [r.studentId.toString(), r]));

    const roster = enrollments
      .sort((a, b) => {
        // rollNo ascending, nulls last, then name.
        if (a.rollNo != null && b.rollNo != null && a.rollNo !== b.rollNo)
          return a.rollNo - b.rollNo;
        if (a.rollNo != null && b.rollNo == null) return -1;
        if (a.rollNo == null && b.rollNo != null) return 1;
        return a.student.name.localeCompare(b.student.name);
      })
      .map((e) => {
        const r = recordByStudent.get(e.student.id.toString());
        return {
          student: {
            publicId: e.student.publicId,
            name: e.student.name,
            nameNe: e.student.nameNe,
            photoUrl: e.student.photoUrl,
            rollNo: e.rollNo,
          },
          record: r
            ? {
                status: r.status,
                source: r.source,
                firstTapAt: r.firstTapAt,
                lastTapAt: r.lastTapAt,
                markedBy: r.markedBy,
                note: r.note,
              }
            : null,
        };
      });

    return {
      section: { publicId: section.publicId, name: section.name, className: section.class.name },
      roster,
    };
  });

  return ok({ section, date, roster });
});

const MarkSchema = z.object({
  sectionId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  entries: z
    .array(
      z.object({
        studentId: z.uuid(),
        status: z.enum(["present", "absent", "late", "leave"]),
      }),
    )
    .min(1)
    .max(300),
});

/** POST /api/attendance — bulk manual marking (single upsert statement). */
export const POST = handler(async (req: Request) => {
  const { session, tenantId } = await requireTenantWrite(MARK_ROLES);
  const body = await parseBody(req, MarkSchema);
  const dbDate = toDbDate(body.date);

  // De-duplicate per student (last entry wins) — duplicate rows in one
  // INSERT ... ON CONFLICT would error ("cannot affect row a second time").
  const entryByStudent = new Map(body.entries.map((e) => [e.studentId, e.status]));

  const result = await withTenant(tenantId, async (tx) => {
    const section = await tx.section.findFirst({
      where: { tenantId, publicId: body.sectionId, deletedAt: null },
      select: { id: true, publicId: true },
    });
    if (!section) throw new ApiError("NOT_FOUND", "Section not found", 404);

    const publicIds = [...entryByStudent.keys()];
    const students = await tx.student.findMany({
      where: { tenantId, publicId: { in: publicIds }, deletedAt: null },
      select: { id: true, publicId: true },
    });
    const studentByPublicId = new Map(students.map((s) => [s.publicId, s]));
    const unknown = publicIds.filter((id) => !studentByPublicId.has(id));
    if (unknown.length > 0)
      throw new ApiError("INVALID_STUDENT", "Unknown student id(s)", 400, { unknown });

    // One round-trip upsert for the whole batch (remote pooler ~200ms RTT).
    // Preserves first_tap_at / last_tap_at / absent_notified_at on conflict.
    const values = [...entryByStudent.entries()].map(([publicId, status]) => {
      const student = studentByPublicId.get(publicId)!;
      return Prisma.sql`(${randomUUID()}::uuid, ${tenantId}, ${student.id}, ${section.id}, ${dbDate}::date, ${status}::"AttendanceStatus", 'manual'::"AttendanceSource", ${session.sub}, now(), now())`;
    });

    await tx.$executeRaw`
      INSERT INTO attendance_records
        (public_id, tenant_id, student_id, section_id, date, status, source, marked_by, created_at, updated_at)
      VALUES ${Prisma.join(values)}
      ON CONFLICT (tenant_id, student_id, date)
      DO UPDATE SET
        status = EXCLUDED.status,
        source = 'manual',
        marked_by = EXCLUDED.marked_by,
        section_id = EXCLUDED.section_id,
        updated_at = now()
    `;

    const statuses: Record<string, number> = {};
    for (const status of entryByStudent.values())
      statuses[status] = (statuses[status] ?? 0) + 1;

    await audit(tx, {
      tenantId,
      action: "update",
      entity: "attendance_records",
      entityId: section.publicId,
      after: { date: body.date, count: entryByStudent.size, statuses },
    });

    return { saved: body.entries.length };
  });

  return ok(result);
});
