import { z } from "zod";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

/** GET /api/academic-years — list academic years. */
export const GET = handler(async () => {
  const { tenantId } = await requireTenantSession();

  const years = await withTenant(tenantId, (tx) =>
    tx.academicYear.findMany({
      where: { deletedAt: null },
      orderBy: { startsAt: "desc" },
      select: {
        publicId: true,
        name: true,
        startsAt: true,
        endsAt: true,
        isCurrent: true,
      },
    }),
  );

  return ok(years);
});

const CreateAcademicYearSchema = z.object({
  name: z.string().min(1),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  makeCurrent: z.boolean().optional(),
});

/** POST /api/academic-years — create an academic year. */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite();
  const body = await parseBody(req, CreateAcademicYearSchema);

  const year = await withTenant(tenantId, async (tx) => {
    const existing = await tx.academicYear.findFirst({
      where: { tenantId, name: body.name },
    });
    if (existing)
      throw new ApiError("YEAR_EXISTS", "An academic year with this name already exists", 409);

    if (body.makeCurrent) {
      await tx.academicYear.updateMany({
        where: { tenantId, isCurrent: true },
        data: { isCurrent: false },
      });
    }

    const row = await tx.academicYear.create({
      data: {
        tenantId,
        name: body.name,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        isCurrent: body.makeCurrent ?? false,
      },
    });

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "academic_years",
      entityId: row.publicId,
      after: {
        name: row.name,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        isCurrent: row.isCurrent,
      },
    });

    return row;
  });

  return created(year);
});
