import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  titleNe: z.string().max(200).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  descriptionNe: z.string().max(5000).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  publish: z.boolean().optional(),
});

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { tenantId } = await requireTenantSession();
  const { id } = await params;

  const hw = await withTenant(tenantId, (tx) =>
    tx.homework.findFirst({
      where: { tenantId, publicId: id, deletedAt: null },
      include: {
        section: { select: { publicId: true, name: true, class: { select: { publicId: true, name: true } } } },
        subject: { select: { publicId: true, name: true, nameNe: true } },
        staff: { select: { publicId: true, name: true } },
        submissions: {
          include: {
            student: { select: { publicId: true, name: true, admissionNo: true } },
          },
          orderBy: { submittedAt: "desc" },
        },
      },
    }),
  );
  if (!hw) throw new ApiError("NOT_FOUND", "Homework not found", 404);

  return ok(hw);
});

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { tenantId } = await requireTenantWrite(["school_admin", "principal", "teacher", "class_teacher"]);
  const { id } = await params;
  const body = await parseBody(req, updateSchema);

  const hw = await withTenant(tenantId, async (tx) => {
    const existing = await tx.homework.findFirst({ where: { tenantId, publicId: id, deletedAt: null }, select: { id: true, publishedAt: true } });
    if (!existing) throw new ApiError("NOT_FOUND", "Homework not found", 404);

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.titleNe !== undefined) data.titleNe = body.titleNe;
    if (body.description !== undefined) data.description = body.description;
    if (body.descriptionNe !== undefined) data.descriptionNe = body.descriptionNe;
    if (body.dueDate !== undefined) data.dueDate = new Date(body.dueDate);
    if (body.publish && !existing.publishedAt) data.publishedAt = new Date();

    const updated = await tx.homework.update({
      where: { id: existing.id },
      data,
      include: {
        section: { select: { publicId: true, name: true, class: { select: { name: true } } } },
        subject: { select: { publicId: true, name: true } },
        staff: { select: { publicId: true, name: true } },
      },
    });

    await audit(tx, { tenantId, action: "update", entity: "homework", entityId: id, after: body });

    return updated;
  });

  return ok(hw);
});

export const DELETE = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { tenantId } = await requireTenantWrite(["school_admin", "principal", "teacher", "class_teacher"]);
  const { id } = await params;

  await withTenant(tenantId, async (tx) => {
    const existing = await tx.homework.findFirst({ where: { tenantId, publicId: id, deletedAt: null }, select: { id: true } });
    if (!existing) throw new ApiError("NOT_FOUND", "Homework not found", 404);

    await tx.homework.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await audit(tx, { tenantId, action: "soft_delete", entity: "homework", entityId: id });
  });

  return ok({ deleted: true });
});
