import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

const slotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  periodNumber: z.number().int().min(1).max(15),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotType: z.enum(["class_period", "break_time", "assembly", "lab"]).default("class_period"),
  subjectId: z.string().uuid().nullable().optional(),
  staffId: z.string().uuid().nullable().optional(),
  room: z.string().max(50).nullable().optional(),
});

const bulkSchema = z.object({
  sectionId: z.string().uuid(),
  slots: z.array(slotSchema).max(100),
});

/** GET — full week grid for a section (or teacher schedule). */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const sectionPub = url.searchParams.get("section");
  const staffPub = url.searchParams.get("staff");

  const result = await withTenant(tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { tenantId, isCurrent: true }, select: { id: true } });
    if (!year) return [];

    const where: Record<string, unknown> = { tenantId, academicYearId: year.id };

    if (sectionPub) {
      const sec = await tx.section.findFirst({ where: { tenantId, publicId: sectionPub, deletedAt: null }, select: { id: true } });
      if (!sec) return [];
      where.sectionId = sec.id;
    }
    if (staffPub) {
      const s = await tx.staff.findFirst({ where: { tenantId, publicId: staffPub, deletedAt: null }, select: { id: true } });
      if (!s) return [];
      where.staffId = s.id;
    }

    return tx.timetableSlot.findMany({
      where,
      orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
      include: {
        subject: { select: { publicId: true, name: true, nameNe: true, code: true } },
        staff: { select: { publicId: true, name: true, nameNe: true } },
        section: { select: { publicId: true, name: true, class: { select: { publicId: true, name: true } } } },
      },
    });
  });

  return ok(result);
});

/** POST — bulk upsert a section's timetable + clash detection. */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite();
  const body = await parseBody(req, bulkSchema);

  const result = await withTenant(tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { tenantId, isCurrent: true }, select: { id: true } });
    if (!year) throw new ApiError("NO_ACADEMIC_YEAR", "No current academic year", 400);

    const section = await tx.section.findFirst({ where: { tenantId, publicId: body.sectionId, deletedAt: null }, select: { id: true } });
    if (!section) throw new ApiError("SECTION_NOT_FOUND", "Section not found", 404);

    const upserted = [];

    for (const slot of body.slots) {
      // Resolve subject + staff
      let subjectDbId: bigint | null = null;
      let staffDbId: bigint | null = null;

      if (slot.subjectId) {
        const sub = await tx.subject.findFirst({ where: { tenantId, publicId: slot.subjectId, deletedAt: null }, select: { id: true } });
        if (!sub) throw new ApiError("SUBJECT_NOT_FOUND", `Subject ${slot.subjectId} not found`, 404);
        subjectDbId = sub.id;
      }
      if (slot.staffId) {
        const s = await tx.staff.findFirst({ where: { tenantId, publicId: slot.staffId, deletedAt: null }, select: { id: true } });
        if (!s) throw new ApiError("STAFF_NOT_FOUND", `Staff ${slot.staffId} not found`, 404);
        staffDbId = s.id;

        // Clash detection: same teacher, same day+period, different section
        if (slot.slotType === "class_period") {
          const clash = await tx.timetableSlot.findFirst({
            where: {
              tenantId,
              academicYearId: year.id,
              staffId: staffDbId,
              dayOfWeek: slot.dayOfWeek,
              periodNumber: slot.periodNumber,
              NOT: { sectionId: section.id },
            },
            include: {
              section: { select: { name: true, class: { select: { name: true } } } },
            },
          });
          if (clash) {
            throw new ApiError(
              "TEACHER_CLASH",
              `Teacher already assigned to ${clash.section.class.name} ${clash.section.name} on day ${slot.dayOfWeek} period ${slot.periodNumber}`,
              409,
              { dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber, conflictSection: `${clash.section.class.name} ${clash.section.name}` },
            );
          }
        }
      }

      const row = await tx.timetableSlot.upsert({
        where: {
          tenantId_sectionId_academicYearId_dayOfWeek_periodNumber: {
            tenantId,
            sectionId: section.id,
            academicYearId: year.id,
            dayOfWeek: slot.dayOfWeek,
            periodNumber: slot.periodNumber,
          },
        },
        update: {
          subjectId: subjectDbId,
          staffId: staffDbId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          slotType: slot.slotType,
          room: slot.room ?? null,
        },
        create: {
          tenantId,
          academicYearId: year.id,
          sectionId: section.id,
          subjectId: subjectDbId,
          staffId: staffDbId,
          dayOfWeek: slot.dayOfWeek,
          periodNumber: slot.periodNumber,
          startTime: slot.startTime,
          endTime: slot.endTime,
          slotType: slot.slotType,
          room: slot.room ?? null,
        },
        include: {
          subject: { select: { publicId: true, name: true } },
          staff: { select: { publicId: true, name: true } },
        },
      });
      upserted.push(row);
    }

    return { upserted: upserted.length };
  });

  return ok(result);
});
