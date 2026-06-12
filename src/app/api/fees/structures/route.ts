import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

const FEE_ROLES = ["school_admin", "principal", "accountant"];

/** GET /api/fees/structures?classId= — fee structure of a class for the current year. */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);

  const classIdParam = url.searchParams.get("classId");
  if (!classIdParam) throw new ApiError("MISSING_CLASS", "classId query param is required", 400);
  const classId = z.uuid().safeParse(classIdParam);
  if (!classId.success) throw new ApiError("NOT_FOUND", "Class not found", 404);

  const result = await withTenant(tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({
      where: { tenantId, isCurrent: true, deletedAt: null },
      select: { id: true, publicId: true, name: true },
    });
    if (!year) return { year: null, rows: [] };

    const klass = await tx.schoolClass.findFirst({
      where: { tenantId, publicId: classId.data, deletedAt: null },
      select: { id: true },
    });
    if (!klass) throw new ApiError("NOT_FOUND", "Class not found", 404);

    const rows = await tx.feeStructure.findMany({
      where: { tenantId, academicYearId: year.id, classId: klass.id, deletedAt: null },
      orderBy: [{ feeHead: { sortOrder: "asc" } }, { feeHead: { name: "asc" } }],
      select: {
        publicId: true,
        amountPaisa: true,
        frequency: true,
        feeHead: { select: { publicId: true, name: true, nameNe: true, sortOrder: true } },
      },
    });

    return { year: { publicId: year.publicId, name: year.name }, rows };
  });

  return ok(result);
});

const itemSchema = z.object({
  feeHeadId: z.uuid(),
  amountPaisa: z.number().int().min(0).max(1_000_000_000),
  frequency: z.enum(["monthly", "quarterly", "annual", "one_time"]),
});

const PutSchema = z.object({
  classId: z.uuid(),
  items: z.array(itemSchema).max(50),
});

/**
 * PUT /api/fees/structures — replace the fee structure of a class for the
 * current academic year. Submitted heads are upserted; omitted ones are
 * soft-deleted. Batched writes in ONE transaction (remote DB, ~200ms RTT).
 */
export const PUT = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(FEE_ROLES);
  const body = await parseBody(req, PutSchema);

  const headIds = [...new Set(body.items.map((i) => i.feeHeadId))];
  if (headIds.length !== body.items.length)
    throw new ApiError("INVALID_HEAD", "Duplicate fee head in items", 400);

  const saved = await withTenant(tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({
      where: { tenantId, isCurrent: true, deletedAt: null },
      select: { id: true },
    });
    if (!year) throw new ApiError("NO_CURRENT_YEAR", "No current academic year is set", 409);

    const klass = await tx.schoolClass.findFirst({
      where: { tenantId, publicId: body.classId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!klass) throw new ApiError("NOT_FOUND", "Class not found", 404);

    const heads = headIds.length
      ? await tx.feeHead.findMany({
          where: { tenantId, publicId: { in: headIds }, deletedAt: null },
          select: { id: true, publicId: true },
        })
      : [];
    if (heads.length !== headIds.length)
      throw new ApiError("INVALID_HEAD", "One or more fee heads do not exist", 400);
    const headDbId = new Map(heads.map((h) => [h.publicId, h.id]));
    const submittedDbIds = body.items.map((i) => headDbId.get(i.feeHeadId)!);

    // Soft-delete live rows for heads no longer in the submitted set.
    await tx.feeStructure.updateMany({
      where: {
        tenantId,
        academicYearId: year.id,
        classId: klass.id,
        deletedAt: null,
        feeHeadId: { notIn: submittedDbIds },
      },
      data: { deletedAt: new Date() },
    });

    // The unique (tenant, year, class, head) constraint covers soft-deleted
    // rows too — fetch ALL existing rows (incl. deleted) so we update instead
    // of violating the constraint with a create.
    const existing = await tx.feeStructure.findMany({
      where: { tenantId, academicYearId: year.id, classId: klass.id },
      select: { id: true, feeHeadId: true },
    });
    const existingByHead = new Map(existing.map((s) => [s.feeHeadId, s.id]));

    // Batch updates: one updateMany per distinct (amountPaisa, frequency) pair.
    const updateGroups = new Map<string, { ids: bigint[]; amountPaisa: number; frequency: (typeof body.items)[number]["frequency"] }>();
    const toCreate: { feeHeadId: bigint; amountPaisa: number; frequency: (typeof body.items)[number]["frequency"] }[] = [];

    for (const item of body.items) {
      const feeHeadId = headDbId.get(item.feeHeadId)!;
      const rowId = existingByHead.get(feeHeadId);
      if (rowId !== undefined) {
        const key = `${item.amountPaisa}|${item.frequency}`;
        const group = updateGroups.get(key) ?? {
          ids: [],
          amountPaisa: item.amountPaisa,
          frequency: item.frequency,
        };
        group.ids.push(rowId);
        updateGroups.set(key, group);
      } else {
        toCreate.push({ feeHeadId, amountPaisa: item.amountPaisa, frequency: item.frequency });
      }
    }

    for (const group of updateGroups.values()) {
      await tx.feeStructure.updateMany({
        where: { tenantId, id: { in: group.ids } },
        data: { amountPaisa: group.amountPaisa, frequency: group.frequency, deletedAt: null },
      });
    }

    if (toCreate.length > 0) {
      await tx.feeStructure.createMany({
        data: toCreate.map((c) => ({
          tenantId,
          academicYearId: year.id,
          classId: klass.id,
          ...c,
        })),
      });
    }

    await audit(tx, {
      tenantId,
      action: "update",
      entity: "fee_structures",
      entityId: null,
      after: { class: klass.name, count: body.items.length },
    });

    return body.items.length;
  });

  return ok({ saved });
});
