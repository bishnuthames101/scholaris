import { z } from "zod";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { pagination, requireTenantWrite } from "@/lib/tenant";

const HR_ROLES = ["school_admin", "principal", "hr_manager"];

const CreateLeaveSchema = z.object({
  staffId: z.string().uuid(),
  leaveType: z.enum(["casual", "sick", "maternity", "paternity", "unpaid", "other"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(1000).optional(),
});

/** GET /api/hr/leaves — list leave requests with filters. */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(HR_ROLES);
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);
  const status = url.searchParams.get("status")?.trim();

  const result = await withTenant(tenantId, async (tx) => {
    const where: Record<string, unknown> = { tenantId };
    if (status && ["pending", "approved", "rejected", "cancelled"].includes(status)) {
      where.status = status;
    }

    const [items, total] = await Promise.all([
      tx.leaveRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          staff: { select: { publicId: true, name: true, nameNe: true, designation: true } },
        },
      }),
      tx.leaveRequest.count({ where }),
    ]);

    return { items, total };
  });

  return ok(result.items, { page, pageSize, total: result.total });
});

/** POST /api/hr/leaves — submit a leave request. */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(HR_ROLES);
  const body = await parseBody(req, CreateLeaveSchema);

  const startDate = new Date(body.startDate + "T00:00:00.000Z");
  const endDate = new Date(body.endDate + "T00:00:00.000Z");
  if (endDate < startDate) {
    throw new ApiError("VALIDATION_ERROR", "End date must be after start date", 400);
  }
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const leave = await withTenant(tenantId, async (tx) => {
    const staff = await tx.staff.findFirst({
      where: { tenantId, publicId: body.staffId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!staff) throw new ApiError("NOT_FOUND", "Staff not found", 404);

    // Check for overlapping leaves
    const overlap = await tx.leaveRequest.findFirst({
      where: {
        tenantId,
        staffId: staff.id,
        status: { in: ["pending", "approved"] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlap) {
      throw new ApiError("OVERLAP", "Leave dates overlap with an existing request", 409);
    }

    const row = await tx.leaveRequest.create({
      data: {
        tenantId,
        staffId: staff.id,
        leaveType: body.leaveType,
        startDate,
        endDate,
        days,
        reason: body.reason ?? null,
      },
      include: {
        staff: { select: { publicId: true, name: true } },
      },
    });

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "leave_request",
      entityId: row.publicId,
      after: { staffName: staff.name, leaveType: body.leaveType, days, startDate: body.startDate, endDate: body.endDate },
    });

    return row;
  });

  return created(leave);
});
