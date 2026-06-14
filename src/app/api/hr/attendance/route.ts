import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

const HR_READ_ROLES = ["school_admin", "principal", "hr_manager"];

const bulkSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  records: z
    .array(
      z.object({
        staffId: z.string().uuid(),
        status: z.enum(["present", "absent", "late", "leave", "half_day"]),
        note: z.string().max(500).optional(),
      }),
    )
    .max(200),
});

/** GET /api/hr/attendance — staff attendance roster for a specific date. */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(HR_READ_ROLES);
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");

  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    throw new ApiError("INVALID_DATE", "Query param ?date=YYYY-MM-DD is required", 400);
  }

  const dateVal = new Date(dateParam + "T00:00:00.000Z");

  const result = await withTenant(tenantId, async (tx) => {
    const staff = await tx.staff.findMany({
      where: { tenantId, deletedAt: null, status: "active" },
      orderBy: { name: "asc" },
      select: { publicId: true, name: true, nameNe: true, designation: true },
    });

    const attendance = await tx.staffAttendance.findMany({
      where: { tenantId, date: dateVal },
      select: {
        publicId: true,
        staff: { select: { publicId: true } },
        status: true,
        note: true,
        source: true,
        checkIn: true,
        checkOut: true,
      },
    });

    const attendanceMap = new Map(
      attendance.map((a) => [a.staff.publicId, a]),
    );

    return staff.map((s) => ({
      ...s,
      attendance: attendanceMap.get(s.publicId) ?? null,
    }));
  });

  return ok(result);
});

/** POST /api/hr/attendance — bulk mark staff attendance (upsert). */
export const POST = handler(async (req: Request) => {
  const { tenantId, session } = await requireTenantWrite(HR_READ_ROLES);
  const body = await parseBody(req, bulkSchema);
  const dateVal = new Date(body.date + "T00:00:00.000Z");

  const result = await withTenant(tenantId, async (tx) => {
    // Batch-validate all staffIds upfront (avoids N+1 queries)
    const staffPids = [...new Set(body.records.map((r) => r.staffId))];
    const staffRows = await tx.staff.findMany({
      where: { tenantId, publicId: { in: staffPids }, deletedAt: null },
      select: { id: true, publicId: true },
    });
    const staffMap = new Map(staffRows.map((s) => [s.publicId, s.id]));
    for (const pid of staffPids) {
      if (!staffMap.has(pid)) {
        throw new ApiError("STAFF_NOT_FOUND", `Staff ${pid} not found`, 404);
      }
    }

    const upserted = [];

    for (const rec of body.records) {
      const staffId = staffMap.get(rec.staffId)!;

      const row = await tx.staffAttendance.upsert({
        where: {
          tenantId_staffId_date: {
            tenantId,
            staffId,
            date: dateVal,
          },
        },
        update: {
          status: rec.status,
          note: rec.note ?? null,
          markedBy: session.sub,
        },
        create: {
          tenantId,
          staffId,
          date: dateVal,
          status: rec.status,
          source: "manual",
          note: rec.note ?? null,
          markedBy: session.sub,
        },
        select: {
          publicId: true,
          status: true,
          staff: { select: { publicId: true, name: true } },
        },
      });
      upserted.push(row);
    }

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "staff_attendance",
      entityId: body.date,
      after: { date: body.date, count: upserted.length },
    });

    return { date: body.date, upserted: upserted.length, records: upserted };
  });

  return ok(result);
});
