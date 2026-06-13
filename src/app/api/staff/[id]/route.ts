import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

function parseId(id: string): string {
  const r = z.uuid().safeParse(id);
  if (!r.success) throw new ApiError("NOT_FOUND", "Staff not found", 404);
  return r.data;
}

/** GET /api/staff/[id] — staff detail, incl. sections they class-teach. */
export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantSession();

    const staff = await withTenant(tenantId, async (tx) => {
      const row = await tx.staff.findFirst({
        where: { tenantId, publicId: id, deletedAt: null },
        include: {
          sections: {
            where: { deletedAt: null },
            select: {
              publicId: true,
              name: true,
              class: { select: { publicId: true, name: true } },
            },
          },
        },
      });
      if (!row) throw new ApiError("NOT_FOUND", "Staff not found", 404);
      return row;
    });

    return ok(staff);
  },
);

const UpdateStaffSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nameNe: z.string().max(200).nullable().optional(),
  designation: z.string().min(1).max(100).optional(),
  phone: z.string().regex(/^\+?[0-9\-]{7,20}$/).nullable().optional(),
  email: z.email().nullable().optional(),
  joinedAt: z.coerce.date().nullable().optional(),
});

/** PATCH /api/staff/[id] — update a staff member. */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantWrite();
    const body = await parseBody(req, UpdateStaffSchema);

    const updated = await withTenant(tenantId, async (tx) => {
      const existing = await tx.staff.findFirst({ where: { tenantId, publicId: id, deletedAt: null } });
      if (!existing)
        throw new ApiError("NOT_FOUND", "Staff not found", 404);

      const row = await tx.staff.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          nameNe: body.nameNe,
          designation: body.designation,
          phone: body.phone,
          email: body.email,
          joinedAt: body.joinedAt,
        },
      });

      await audit(tx, {
        tenantId,
        action: "update",
        entity: "staff",
        entityId: row.publicId,
        before: {
          name: existing.name,
          designation: existing.designation,
          phone: existing.phone,
          email: existing.email,
          joinedAt: existing.joinedAt,
        },
        after: {
          name: row.name,
          designation: row.designation,
          phone: row.phone,
          email: row.email,
          joinedAt: row.joinedAt,
        },
      });

      return row;
    });

    return ok(updated);
  },
);

/** DELETE /api/staff/[id] — soft-delete; unassign them as class teacher. */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const id = parseId((await ctx.params).id);
    const { tenantId } = await requireTenantWrite();

    const deleted = await withTenant(tenantId, async (tx) => {
      const existing = await tx.staff.findFirst({ where: { tenantId, publicId: id, deletedAt: null } });
      if (!existing)
        throw new ApiError("NOT_FOUND", "Staff not found", 404);

      await tx.section.updateMany({
        where: { classTeacherId: existing.id },
        data: { classTeacherId: null },
      });

      const row = await tx.staff.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await audit(tx, {
        tenantId,
        action: "soft_delete",
        entity: "staff",
        entityId: row.publicId,
        before: { name: existing.name, designation: existing.designation },
      });

      return row;
    });

    return ok({ publicId: deleted.publicId, deletedAt: deleted.deletedAt });
  },
);
