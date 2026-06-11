import { z } from "zod";
import { ApiError, created, handler, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

const CreateSectionSchema = z.object({
  name: z.string().min(1),
  classTeacherId: z.uuid().optional(),
});

/** POST /api/classes/[id]/sections — create a section in a class. */
export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const { tenantId } = await requireTenantWrite();
    const body = await parseBody(req, CreateSectionSchema);

    const section = await withTenant(tenantId, async (tx) => {
      const schoolClass = await tx.schoolClass.findUnique({ where: { publicId: id } });
      if (!schoolClass || schoolClass.deletedAt)
        throw new ApiError("NOT_FOUND", "Class not found", 404);

      let classTeacherId: bigint | undefined;
      if (body.classTeacherId) {
        const staff = await tx.staff.findUnique({
          where: { publicId: body.classTeacherId },
        });
        if (!staff || staff.deletedAt)
          throw new ApiError("NOT_FOUND", "Class teacher (staff) not found", 404);
        classTeacherId = staff.id;
      }

      const dup = await tx.section.findFirst({
        where: { tenantId, classId: schoolClass.id, name: body.name },
      });
      if (dup)
        throw new ApiError(
          "SECTION_EXISTS",
          "A section with this name already exists in this class",
          409,
        );

      const row = await tx.section.create({
        data: {
          tenantId,
          classId: schoolClass.id,
          name: body.name,
          classTeacherId,
        },
      });

      await audit(tx, {
        tenantId,
        action: "create",
        entity: "sections",
        entityId: row.publicId,
        after: {
          name: row.name,
          class: schoolClass.publicId,
          classTeacher: body.classTeacherId ?? null,
        },
      });

      return row;
    });

    return created(section);
  },
);
