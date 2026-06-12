import { z } from "zod";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";
import { validateBands } from "@/lib/exams/grading";
import { ensureDefaultGradeScale } from "@/lib/exams/scales";
import { BandSchema, EXAM_ADMIN_ROLES } from "@/lib/exams/schemas";

/** GET /api/exams/grade-scales — list scales (seeds the NEB default lazily). */
export const GET = handler(async () => {
  const { tenantId } = await requireTenantSession();

  const rows = await withTenant(tenantId, async (tx) => {
    await ensureDefaultGradeScale(tx, tenantId);
    return tx.gradeScale.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: {
        bands: { orderBy: { sortOrder: "asc" } },
        _count: { select: { exams: { where: { deletedAt: null } } } },
      },
    });
  });

  return ok(rows);
});

const CreateScaleSchema = z.object({
  name: z.string().min(1).max(80),
  isDefault: z.boolean().default(false),
  bands: z.array(BandSchema).min(2).max(20),
});

/** POST /api/exams/grade-scales — create a custom scale. */
export const POST = handler(async (req: Request) => {
  const { tenantId, session } = await requireTenantWrite(EXAM_ADMIN_ROLES);
  const body = await parseBody(req, CreateScaleSchema);

  const err = validateBands(body.bands);
  if (err) throw new ApiError("INVALID_BANDS", err, 422);

  const scale = await withTenant(tenantId, async (tx) => {
    const dup = await tx.gradeScale.findFirst({
      where: { tenantId, name: body.name, deletedAt: null },
      select: { id: true },
    });
    if (dup) throw new ApiError("DUPLICATE", "A grade scale with this name already exists", 409);

    if (body.isDefault) {
      await tx.gradeScale.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const row = await tx.gradeScale.create({
      data: {
        tenantId,
        name: body.name,
        isDefault: body.isDefault,
        bands: {
          create: body.bands.map((b, i) => ({
            tenantId,
            letter: b.letter,
            letterNe: b.letterNe ?? null,
            gradePoint: b.gradePoint,
            minPercent: b.minPercent,
            maxPercent: b.maxPercent,
            isPassing: b.isPassing,
            sortOrder: i,
          })),
        },
      },
      include: { bands: { orderBy: { sortOrder: "asc" } } },
    });

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "grade_scales",
      entityId: row.publicId,
      after: { name: row.name, isDefault: row.isDefault, bands: body.bands },
      reason: `Created by ${session.sub}`,
    });

    return row;
  });

  return created(scale);
});
