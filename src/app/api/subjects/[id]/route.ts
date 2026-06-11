import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

const UpdateSubjectSchema = z.object({
  name: z.string().min(1).optional(),
  nameNe: z.string().nullable().optional(),
  code: z.string().nullable().optional(),
  hasPractical: z.boolean().optional(),
  fullMarksTh: z.number().int().optional(),
  passMarksTh: z.number().int().optional(),
  fullMarksPr: z.number().int().nullable().optional(),
  passMarksPr: z.number().int().nullable().optional(),
  creditHours: z.number().nullable().optional(),
});

/** PATCH /api/subjects/[id] — update a subject. */
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const { tenantId } = await requireTenantWrite();
    const body = await parseBody(req, UpdateSubjectSchema);

    const updated = await withTenant(tenantId, async (tx) => {
      const existing = await tx.subject.findUnique({ where: { publicId: id } });
      if (!existing || existing.deletedAt)
        throw new ApiError("NOT_FOUND", "Subject not found", 404);

      const effectiveHasPractical = body.hasPractical ?? existing.hasPractical;
      const effectiveFullPr =
        body.fullMarksPr === undefined ? existing.fullMarksPr : body.fullMarksPr;
      const effectivePassPr =
        body.passMarksPr === undefined ? existing.passMarksPr : body.passMarksPr;
      if (effectiveHasPractical && (effectiveFullPr === null || effectivePassPr === null))
        throw new ApiError(
          "VALIDATION_ERROR",
          "fullMarksPr and passMarksPr are required when hasPractical is true",
          422,
        );

      if (body.name !== undefined && body.name !== existing.name) {
        const dup = await tx.subject.findFirst({
          where: {
            tenantId,
            classId: existing.classId,
            name: body.name,
            id: { not: existing.id },
          },
        });
        if (dup)
          throw new ApiError(
            "SUBJECT_EXISTS",
            "A subject with this name already exists in this class",
            409,
          );
      }

      const row = await tx.subject.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          nameNe: body.nameNe,
          code: body.code,
          hasPractical: body.hasPractical,
          fullMarksTh: body.fullMarksTh,
          passMarksTh: body.passMarksTh,
          fullMarksPr: body.fullMarksPr,
          passMarksPr: body.passMarksPr,
          creditHours: body.creditHours,
        },
      });

      await audit(tx, {
        tenantId,
        action: "update",
        entity: "subjects",
        entityId: row.publicId,
        before: {
          name: existing.name,
          code: existing.code,
          hasPractical: existing.hasPractical,
          fullMarksTh: existing.fullMarksTh,
          passMarksTh: existing.passMarksTh,
          fullMarksPr: existing.fullMarksPr,
          passMarksPr: existing.passMarksPr,
        },
        after: {
          name: row.name,
          code: row.code,
          hasPractical: row.hasPractical,
          fullMarksTh: row.fullMarksTh,
          passMarksTh: row.passMarksTh,
          fullMarksPr: row.fullMarksPr,
          passMarksPr: row.passMarksPr,
        },
      });

      return row;
    });

    return ok(updated);
  },
);

/** DELETE /api/subjects/[id] — soft-delete a subject. */
export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const { tenantId } = await requireTenantWrite();

    const deleted = await withTenant(tenantId, async (tx) => {
      const existing = await tx.subject.findUnique({ where: { publicId: id } });
      if (!existing || existing.deletedAt)
        throw new ApiError("NOT_FOUND", "Subject not found", 404);

      const row = await tx.subject.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await audit(tx, {
        tenantId,
        action: "soft_delete",
        entity: "subjects",
        entityId: row.publicId,
        before: { name: existing.name, code: existing.code },
      });

      return row;
    });

    return ok({ publicId: deleted.publicId, deletedAt: deleted.deletedAt });
  },
);
