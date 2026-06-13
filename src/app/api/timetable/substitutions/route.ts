import { z } from "zod";
import { ApiError, handler, ok, created, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireTenantSession, requireTenantWrite, pagination } from "@/lib/tenant";

const createSchema = z.object({
  timetableSlotId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  substituteStaffId: z.string().uuid(),
  reason: z.string().max(200).optional(),
});

export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const result = await withTenant(tenantId, async (tx) => {
    const where: Record<string, unknown> = { tenantId };
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) dateFilter.lte = new Date(to);
      where.date = dateFilter;
    }

    const [items, total] = await Promise.all([
      tx.substitution.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { date: "desc" },
        include: {
          timetableSlot: {
            include: {
              section: { select: { publicId: true, name: true, class: { select: { name: true } } } },
              subject: { select: { publicId: true, name: true } },
              staff: { select: { publicId: true, name: true } },
            },
          },
          substituteStaff: { select: { publicId: true, name: true } },
        },
      }),
      tx.substitution.count({ where }),
    ]);
    return { items, total };
  });

  return ok(result.items, { page, pageSize, total: result.total });
});

export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite();
  const body = await parseBody(req, createSchema);

  const item = await withTenant(tenantId, async (tx) => {
    const slot = await tx.timetableSlot.findFirst({
      where: { tenantId, publicId: body.timetableSlotId },
      select: { id: true, dayOfWeek: true, periodNumber: true, academicYearId: true },
    });
    if (!slot) throw new ApiError("SLOT_NOT_FOUND", "Timetable slot not found", 404);

    const staff = await tx.staff.findFirst({
      where: { tenantId, publicId: body.substituteStaffId, deletedAt: null },
      select: { id: true },
    });
    if (!staff) throw new ApiError("STAFF_NOT_FOUND", "Substitute staff not found", 404);

    const date = new Date(body.date);

    // Check if substitute teacher has a clash at this time on this day
    const clash = await tx.timetableSlot.findFirst({
      where: {
        tenantId,
        academicYearId: slot.academicYearId,
        staffId: staff.id,
        dayOfWeek: slot.dayOfWeek,
        periodNumber: slot.periodNumber,
      },
      include: { section: { select: { name: true, class: { select: { name: true } } } } },
    });
    if (clash) {
      throw new ApiError(
        "SUBSTITUTE_CLASH",
        `Substitute teacher already has ${clash.section.class.name} ${clash.section.name} at this period`,
        409,
      );
    }

    return tx.substitution.upsert({
      where: { timetableSlotId_date: { timetableSlotId: slot.id, date } },
      update: { substituteStaffId: staff.id, reason: body.reason ?? null },
      create: {
        tenantId,
        timetableSlotId: slot.id,
        date,
        substituteStaffId: staff.id,
        reason: body.reason ?? null,
      },
      include: {
        timetableSlot: {
          include: {
            section: { select: { publicId: true, name: true, class: { select: { name: true } } } },
            subject: { select: { name: true } },
            staff: { select: { name: true } },
          },
        },
        substituteStaff: { select: { publicId: true, name: true } },
      },
    });
  });

  return created(item);
});
