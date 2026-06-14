import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

const ADM_ROLES = ["school_admin", "principal", "front_desk"];

function parseId(id: string): string {
  const r = z.uuid().safeParse(id);
  if (!r.success) throw new ApiError("NOT_FOUND", "Application not found", 404);
  return r.data;
}

const ReviewSchema = z.object({
  action: z.enum(["approve", "reject", "withdraw"]),
  reviewNote: z.string().max(1000).optional(),
});

/** GET /api/admissions/applications/[id] — application detail. */
export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantWrite(ADM_ROLES);

    const app = await withTenant(tenantId, async (tx) => {
      const row = await tx.admissionApplication.findFirst({
        where: { tenantId, publicId: id, deletedAt: null },
        include: {
          applyingForClass: { select: { publicId: true, name: true } },
          applyingForSection: { select: { publicId: true, name: true } },
          enquiry: { select: { publicId: true, studentName: true, guardianPhone: true } },
        },
      });
      if (!row) throw new ApiError("NOT_FOUND", "Application not found", 404);
      return row;
    });

    return ok(app);
  },
);

/** PATCH /api/admissions/applications/[id] — approve/reject/withdraw. */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId, session } = await requireTenantWrite(ADM_ROLES);
    const body = await parseBody(req, ReviewSchema);

    const updated = await withTenant(tenantId, async (tx) => {
      const existing = await tx.admissionApplication.findFirst({
        where: { tenantId, publicId: id, deletedAt: null },
      });
      if (!existing) throw new ApiError("NOT_FOUND", "Application not found", 404);

      const statusMap = {
        approve: "app_approved" as const,
        reject: "app_rejected" as const,
        withdraw: "withdrawn" as const,
      };
      const validFromStatus: Record<string, string[]> = {
        approve: ["submitted", "under_review"],
        reject: ["submitted", "under_review"],
        withdraw: ["submitted", "under_review", "app_approved"],
      };

      if (!validFromStatus[body.action].includes(existing.status)) {
        throw new ApiError(
          "INVALID_STATUS",
          `Cannot ${body.action} an application with status "${existing.status}"`,
          409,
        );
      }

      const row = await tx.admissionApplication.update({
        where: { id: existing.id },
        data: {
          status: statusMap[body.action],
          reviewedBy: session.sub,
          reviewedAt: new Date(),
          reviewNote: body.reviewNote,
        },
        include: {
          applyingForClass: { select: { publicId: true, name: true } },
        },
      });

      // If linked enquiry exists and approved, mark it as converted
      if (body.action === "approve" && existing.enquiryId) {
        await tx.enquiry.update({
          where: { id: existing.enquiryId },
          data: { status: "converted" },
        });
      }

      await audit(tx, {
        tenantId,
        action: body.action,
        entity: "admission_application",
        entityId: row.publicId,
        before: { status: existing.status },
        after: { status: row.status, reviewNote: body.reviewNote },
      });

      return row;
    });

    return ok(updated);
  },
);
