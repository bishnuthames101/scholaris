import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";
import { EXAM_ADMIN_ROLES } from "@/lib/exams/schemas";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ reason: z.string().min(3).max(500) });

/**
 * POST /api/exams/[id]/unlock — audited override: reopen a published exam
 * for corrections. Requires a reason; recorded in the immutable audit log.
 * Results stay visible until the exam is re-published (which recomputes them).
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId, session } = await requireTenantWrite(EXAM_ADMIN_ROLES);
  const idResult = z.uuid().safeParse((await ctx.params).id);
  if (!idResult.success) throw new ApiError("NOT_FOUND", "Exam not found", 404);
  const { reason } = await parseBody(req, bodySchema);

  const result = await withTenant(tenantId, async (tx) => {
    const exam = await tx.exam.findFirst({
      where: { tenantId, publicId: idResult.data, deletedAt: null },
      select: { id: true, publicId: true, name: true, status: true, publishedAt: true },
    });
    if (!exam) throw new ApiError("NOT_FOUND", "Exam not found", 404);
    if (exam.status !== "published")
      throw new ApiError("NOT_PUBLISHED", "This exam is not published", 409);

    const row = await tx.exam.update({
      where: { id: exam.id },
      data: { status: "draft", publishedAt: null, publishedBy: null },
      select: { publicId: true, name: true, status: true },
    });

    await audit(tx, {
      tenantId,
      action: "update",
      entity: "exams",
      entityId: exam.publicId,
      before: { status: "published", publishedAt: exam.publishedAt },
      after: { status: "draft" },
      reason: `Unlocked by ${session.sub}: ${reason}`,
    });

    return row;
  });

  return ok(result);
});
