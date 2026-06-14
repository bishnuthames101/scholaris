import { z } from "zod";
import { ApiError, created, handler, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

const ADM_ROLES = ["school_admin", "principal", "front_desk"];

function parseId(id: string): string {
  const r = z.uuid().safeParse(id);
  if (!r.success) throw new ApiError("NOT_FOUND", "Enquiry not found", 404);
  return r.data;
}

const CreateFollowUpSchema = z.object({
  note: z.string().min(1).max(2000),
  contactedVia: z.string().max(50).optional(),
  nextFollowUp: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** POST /api/admissions/enquiries/[id]/follow-ups — add a follow-up note. */
export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const enquiryPid = parseId((await ctx.params).id);
    const { tenantId, session } = await requireTenantWrite(ADM_ROLES);
    const body = await parseBody(req, CreateFollowUpSchema);

    const followUp = await withTenant(tenantId, async (tx) => {
      const enquiry = await tx.enquiry.findFirst({
        where: { tenantId, publicId: enquiryPid, deletedAt: null },
        select: { id: true, studentName: true },
      });
      if (!enquiry) throw new ApiError("NOT_FOUND", "Enquiry not found", 404);

      const row = await tx.enquiryFollowUp.create({
        data: {
          tenantId,
          enquiryId: enquiry.id,
          note: body.note,
          contactedVia: body.contactedVia,
          nextFollowUp: body.nextFollowUp ? new Date(body.nextFollowUp + "T00:00:00.000Z") : null,
          createdBy: session.sub,
        },
      });

      // Update last contacted on enquiry
      await tx.enquiry.update({
        where: { id: enquiry.id },
        data: { lastContactedAt: new Date() },
      });

      await audit(tx, {
        tenantId,
        action: "create",
        entity: "enquiry_follow_up",
        entityId: row.publicId,
        after: { enquiryId: enquiryPid, contactedVia: body.contactedVia },
      });

      return row;
    });

    return created(followUp);
  },
);
