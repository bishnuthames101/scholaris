import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

const ADM_ROLES = ["school_admin", "principal", "front_desk"];

function parseId(id: string): string {
  const r = z.uuid().safeParse(id);
  if (!r.success) throw new ApiError("NOT_FOUND", "Enquiry not found", 404);
  return r.data;
}

const UpdateEnquirySchema = z.object({
  status: z.enum(["new_enquiry", "contacted", "visit_scheduled", "visited", "application_sent", "converted", "lost"]).optional(),
  studentName: z.string().min(1).max(200).optional(),
  guardianName: z.string().min(1).max(200).optional(),
  guardianPhone: z.string().regex(/^\+?[0-9\-]{7,20}$/).optional(),
  guardianEmail: z.string().email().nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  assignedTo: z.string().max(200).nullable().optional(),
});

/** GET /api/admissions/enquiries/[id] — enquiry detail with follow-ups. */
export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantWrite(ADM_ROLES);

    const enquiry = await withTenant(tenantId, async (tx) => {
      const row = await tx.enquiry.findFirst({
        where: { tenantId, publicId: id, deletedAt: null },
        include: {
          applyingForClass: { select: { publicId: true, name: true } },
          followUps: { orderBy: { createdAt: "desc" }, take: 20 },
          application: { select: { publicId: true, applicationNo: true, status: true } },
        },
      });
      if (!row) throw new ApiError("NOT_FOUND", "Enquiry not found", 404);
      return row;
    });

    return ok(enquiry);
  },
);

/** PATCH /api/admissions/enquiries/[id] — update enquiry status/fields. */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantWrite(ADM_ROLES);
    const body = await parseBody(req, UpdateEnquirySchema);

    const updated = await withTenant(tenantId, async (tx) => {
      const existing = await tx.enquiry.findFirst({
        where: { tenantId, publicId: id, deletedAt: null },
      });
      if (!existing) throw new ApiError("NOT_FOUND", "Enquiry not found", 404);

      const row = await tx.enquiry.update({
        where: { id: existing.id },
        data: {
          status: body.status,
          studentName: body.studentName,
          guardianName: body.guardianName,
          guardianPhone: body.guardianPhone,
          guardianEmail: body.guardianEmail,
          note: body.note,
          assignedTo: body.assignedTo,
          lastContactedAt: body.status ? new Date() : undefined,
        },
        include: {
          applyingForClass: { select: { publicId: true, name: true } },
        },
      });

      await audit(tx, {
        tenantId,
        action: "update",
        entity: "enquiry",
        entityId: row.publicId,
        before: { status: existing.status },
        after: { status: row.status },
      });

      return row;
    });

    return ok(updated);
  },
);

/** DELETE /api/admissions/enquiries/[id] — soft-delete. */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantWrite(ADM_ROLES);

    await withTenant(tenantId, async (tx) => {
      const existing = await tx.enquiry.findFirst({
        where: { tenantId, publicId: id, deletedAt: null },
      });
      if (!existing) throw new ApiError("NOT_FOUND", "Enquiry not found", 404);

      await tx.enquiry.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await audit(tx, {
        tenantId,
        action: "soft_delete",
        entity: "enquiry",
        entityId: existing.publicId,
        before: { studentName: existing.studentName },
      });
    });

    return ok({ publicId: id, deleted: true });
  },
);
