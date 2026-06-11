import { z } from "zod";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

/** GET /api/classes/[id]/subjects — list subjects of a class. */
export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const { tenantId } = await requireTenantSession();

    const subjects = await withTenant(tenantId, async (tx) => {
      const schoolClass = await tx.schoolClass.findUnique({ where: { publicId: id } });
      if (!schoolClass || schoolClass.deletedAt)
        throw new ApiError("NOT_FOUND", "Class not found", 404);

      return tx.subject.findMany({
        where: { classId: schoolClass.id, deletedAt: null },
        orderBy: { name: "asc" },
      });
    });

    return ok(subjects);
  },
);

const CreateSubjectSchema = z
  .object({
    name: z.string().min(1),
    nameNe: z.string().optional(),
    code: z.string().optional(),
    hasPractical: z.boolean().optional(),
    fullMarksTh: z.number().int().optional(),
    passMarksTh: z.number().int().optional(),
    fullMarksPr: z.number().int().optional(),
    passMarksPr: z.number().int().optional(),
    creditHours: z.number().optional(),
  })
  .refine(
    (b) => !b.hasPractical || (b.fullMarksPr !== undefined && b.passMarksPr !== undefined),
    {
      message: "fullMarksPr and passMarksPr are required when hasPractical is true",
      path: ["fullMarksPr"],
    },
  );

/** POST /api/classes/[id]/subjects — create a subject in a class. */
export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const { tenantId } = await requireTenantWrite();
    const body = await parseBody(req, CreateSubjectSchema);

    const subject = await withTenant(tenantId, async (tx) => {
      const schoolClass = await tx.schoolClass.findUnique({ where: { publicId: id } });
      if (!schoolClass || schoolClass.deletedAt)
        throw new ApiError("NOT_FOUND", "Class not found", 404);

      const dup = await tx.subject.findFirst({
        where: { tenantId, classId: schoolClass.id, name: body.name },
      });
      if (dup)
        throw new ApiError(
          "SUBJECT_EXISTS",
          "A subject with this name already exists in this class",
          409,
        );

      const row = await tx.subject.create({
        data: {
          tenantId,
          classId: schoolClass.id,
          name: body.name,
          nameNe: body.nameNe,
          code: body.code,
          hasPractical: body.hasPractical ?? false,
          fullMarksTh: body.fullMarksTh ?? 100,
          passMarksTh: body.passMarksTh ?? 35,
          fullMarksPr: body.fullMarksPr,
          passMarksPr: body.passMarksPr,
          creditHours: body.creditHours,
        },
      });

      await audit(tx, {
        tenantId,
        action: "create",
        entity: "subjects",
        entityId: row.publicId,
        after: {
          name: row.name,
          code: row.code,
          class: schoolClass.publicId,
          hasPractical: row.hasPractical,
          fullMarksTh: row.fullMarksTh,
          passMarksTh: row.passMarksTh,
          fullMarksPr: row.fullMarksPr,
          passMarksPr: row.passMarksPr,
        },
      });

      return row;
    });

    return created(subject);
  },
);
