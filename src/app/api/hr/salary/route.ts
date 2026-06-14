import { z } from "zod";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { pagination, requireTenantWrite } from "@/lib/tenant";

const HR_ROLES = ["school_admin", "principal", "hr_manager"];

const CreateSalarySchema = z.object({
  staffId: z.string().uuid(),
  basicPaisa: z.number().int().min(0),
  allowancesPaisa: z.number().int().min(0).default(0),
  deductionsPaisa: z.number().int().min(0).default(0),
  breakdown: z.record(z.string(), z.number()).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** GET /api/hr/salary — list salary structures. */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(HR_ROLES);
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);
  const staffPid = url.searchParams.get("staffId")?.trim();

  const result = await withTenant(tenantId, async (tx) => {
    const where: Record<string, unknown> = { tenantId };

    if (staffPid) {
      const r = z.uuid().safeParse(staffPid);
      if (r.success) {
        const staff = await tx.staff.findFirst({
          where: { tenantId, publicId: r.data, deletedAt: null },
          select: { id: true },
        });
        if (staff) where.staffId = staff.id;
      }
    }

    const [items, total] = await Promise.all([
      tx.salaryStructure.findMany({
        where,
        orderBy: { effectiveFrom: "desc" },
        skip,
        take: pageSize,
        include: {
          staff: { select: { publicId: true, name: true, nameNe: true, designation: true } },
        },
      }),
      tx.salaryStructure.count({ where }),
    ]);

    return { items, total };
  });

  return ok(result.items, { page, pageSize, total: result.total });
});

/** POST /api/hr/salary — create a salary structure. */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(HR_ROLES);
  const body = await parseBody(req, CreateSalarySchema);

  const salary = await withTenant(tenantId, async (tx) => {
    const staff = await tx.staff.findFirst({
      where: { tenantId, publicId: body.staffId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!staff) throw new ApiError("NOT_FOUND", "Staff not found", 404);

    const effectiveFrom = new Date(body.effectiveFrom + "T00:00:00.000Z");

    // Close any existing open salary structure
    await tx.salaryStructure.updateMany({
      where: { tenantId, staffId: staff.id, effectiveTo: null },
      data: { effectiveTo: effectiveFrom },
    });

    const row = await tx.salaryStructure.create({
      data: {
        tenantId,
        staffId: staff.id,
        basicPaisa: body.basicPaisa,
        allowancesPaisa: body.allowancesPaisa,
        deductionsPaisa: body.deductionsPaisa,
        breakdown: (body.breakdown ?? {}) as Record<string, number>,
        effectiveFrom,
      },
      include: {
        staff: { select: { publicId: true, name: true } },
      },
    });

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "salary_structure",
      entityId: row.publicId,
      after: {
        staffName: staff.name,
        basicPaisa: body.basicPaisa,
        allowancesPaisa: body.allowancesPaisa,
        deductionsPaisa: body.deductionsPaisa,
        effectiveFrom: body.effectiveFrom,
      },
    });

    return row;
  });

  return created(salary);
});
