import { z } from "zod";
import { ApiError, handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

function parseId(id: string): string {
  const r = z.uuid().safeParse(id);
  if (!r.success) throw new ApiError("NOT_FOUND", "Assignment not found", 404);
  return r.data;
}

/** DELETE /api/transport/assignments/[id] — remove assignment (hard delete). */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantWrite(["school_admin", "transport"]);

    await withTenant(tenantId, async (tx) => {
      const existing = await tx.transportAssignment.findFirst({
        where: { tenantId, publicId: id },
        include: {
          student: { select: { publicId: true, name: true } },
          route: { select: { publicId: true, name: true } },
          stop: { select: { publicId: true, name: true } },
        },
      });
      if (!existing) throw new ApiError("NOT_FOUND", "Assignment not found", 404);

      await tx.transportAssignment.delete({ where: { id: existing.id } });

      await audit(tx, {
        tenantId,
        action: "delete",
        entity: "transport_assignments",
        entityId: existing.publicId,
        before: {
          studentId: existing.student.publicId,
          studentName: existing.student.name,
          routeId: existing.route.publicId,
          routeName: existing.route.name,
          stopId: existing.stop.publicId,
          stopName: existing.stop.name,
          monthlyFeePaisa: existing.monthlyFeePaisa,
        },
      });
    });

    return ok({ publicId: id, deleted: true });
  },
);
