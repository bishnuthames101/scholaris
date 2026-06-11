import { z } from "zod";
import { ApiError, created, handler, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

type Ctx = { params: Promise<{ id: string }> };

const RelationSchema = z.enum([
  "father",
  "mother",
  "grandfather",
  "grandmother",
  "uncle",
  "aunt",
  "brother",
  "sister",
  "other",
]);
const ChannelSchema = z.enum(["whatsapp", "sms", "viber", "push"]);

const LinkExistingSchema = z.object({
  guardianId: z.uuid(),
  relation: RelationSchema.optional(),
  isPrimary: z.boolean().optional(),
});

const NewGuardianSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(5),
  relation: RelationSchema,
  isPrimary: z.boolean().optional(),
  email: z.email().optional(),
  phone2: z.string().optional(),
  occupation: z.string().optional(),
  address: z.string().optional(),
  preferredChannel: ChannelSchema.optional(),
});

const BodySchema = z.union([LinkExistingSchema, NewGuardianSchema]);

/** POST /api/students/[id]/guardians — link existing or create + link a guardian. */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantWrite();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success)
    throw new ApiError("NOT_FOUND", "Student not found", 404);
  const body = await parseBody(req, BodySchema);

  const result = await withTenant(tenantId, async (tx) => {
    const student = await tx.student.findFirst({
      where: { tenantId, publicId: id, deletedAt: null },
      select: { id: true, publicId: true },
    });
    if (!student) throw new ApiError("NOT_FOUND", "Student not found", 404);

    let guardian;
    if ("guardianId" in body) {
      guardian = await tx.guardian.findFirst({
        where: { tenantId, publicId: body.guardianId, deletedAt: null },
      });
      if (!guardian) throw new ApiError("NOT_FOUND", "Guardian not found", 404);
    } else {
      guardian = await tx.guardian.create({
        data: {
          tenantId,
          name: body.name,
          phone: body.phone,
          phone2: body.phone2,
          email: body.email,
          occupation: body.occupation,
          address: body.address,
          preferredChannel: body.preferredChannel,
        },
      });
      await audit(tx, {
        tenantId,
        action: "create",
        entity: "guardians",
        entityId: guardian.publicId,
        after: { name: guardian.name, phone: guardian.phone },
      });
    }

    const existingLink = await tx.studentGuardian.findUnique({
      where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } },
    });
    if (existingLink)
      throw new ApiError("ALREADY_LINKED", "Guardian is already linked to this student", 409);

    const isPrimary = body.isPrimary ?? false;
    if (isPrimary) {
      await tx.studentGuardian.updateMany({
        where: { studentId: student.id, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const relation = ("relation" in body && body.relation) || "other";
    const link = await tx.studentGuardian.create({
      data: {
        studentId: student.id,
        guardianId: guardian.id,
        relation,
        isPrimary,
      },
    });
    await audit(tx, {
      tenantId,
      action: "create",
      entity: "student_guardians",
      entityId: student.publicId,
      after: { guardianId: guardian.publicId, relation: link.relation, isPrimary: link.isPrimary },
    });

    return { guardian, relation: link.relation, isPrimary: link.isPrimary };
  });

  return created(result);
});
