import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

const HR_ROLES = ["school_admin", "principal", "hr_manager"];

function parseId(id: string): string {
  const r = z.uuid().safeParse(id);
  if (!r.success) throw new ApiError("NOT_FOUND", "Leave request not found", 404);
  return r.data;
}

const ReviewSchema = z.object({
  action: z.enum(["approve", "reject", "cancel"]),
  reviewNote: z.string().max(500).optional(),
});

/** PATCH /api/hr/leaves/[id] — approve, reject, or cancel a leave request. */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId, session } = await requireTenantWrite(HR_ROLES);
    const body = await parseBody(req, ReviewSchema);

    const updated = await withTenant(tenantId, async (tx) => {
      const existing = await tx.leaveRequest.findFirst({
        where: { tenantId, publicId: id },
        include: { staff: { select: { publicId: true, name: true } } },
      });
      if (!existing) throw new ApiError("NOT_FOUND", "Leave request not found", 404);

      if (body.action === "approve" && existing.status !== "pending") {
        throw new ApiError("INVALID_STATUS", "Can only approve pending requests", 409);
      }
      if (body.action === "reject" && existing.status !== "pending") {
        throw new ApiError("INVALID_STATUS", "Can only reject pending requests", 409);
      }
      if (body.action === "cancel" && !["pending", "approved"].includes(existing.status)) {
        throw new ApiError("INVALID_STATUS", "Can only cancel pending or approved requests", 409);
      }

      const statusMap = { approve: "approved", reject: "rejected", cancel: "cancelled" } as const;

      const row = await tx.leaveRequest.update({
        where: { id: existing.id },
        data: {
          status: statusMap[body.action],
          reviewedBy: session.sub,
          reviewedAt: new Date(),
          reviewNote: body.reviewNote ?? null,
        },
        include: {
          staff: { select: { publicId: true, name: true } },
        },
      });

      await audit(tx, {
        tenantId,
        action: body.action,
        entity: "leave_request",
        entityId: row.publicId,
        before: { status: existing.status },
        after: { status: row.status, reviewNote: body.reviewNote },
      });

      return row;
    });

    return ok(updated);
  },
);
