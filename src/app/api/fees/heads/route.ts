import { z } from "zod";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";

const FEE_ROLES = ["school_admin", "principal", "accountant"];

/** GET /api/fees/heads — list fee heads with live structure counts. */
export const GET = handler(async () => {
  const { tenantId } = await requireTenantSession();

  const rows = await withTenant(tenantId, (tx) =>
    tx.feeHead.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { structures: { where: { deletedAt: null } } } },
      },
    }),
  );

  return ok(rows);
});

const CreateHeadSchema = z.object({
  name: z.string().min(1).max(80),
  nameNe: z.string().max(80).optional(),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

/** POST /api/fees/heads — create a fee head. */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(FEE_ROLES);
  const body = await parseBody(req, CreateHeadSchema);

  const head = await withTenant(tenantId, async (tx) => {
    const dup = await tx.feeHead.findFirst({
      where: { tenantId, name: body.name, deletedAt: null },
      select: { id: true },
    });
    if (dup) throw new ApiError("DUPLICATE", "A fee head with this name already exists", 409);

    let row;
    try {
      row = await tx.feeHead.create({
        data: {
          tenantId,
          name: body.name,
          nameNe: body.nameNe ?? null,
          sortOrder: body.sortOrder,
        },
      });
    } catch (err) {
      // Race with the pre-check, or a soft-deleted head holding the unique
      // (tenant_id, name) slot.
      if (err && typeof err === "object" && (err as { code?: string }).code === "P2002")
        throw new ApiError("DUPLICATE", "A fee head with this name already exists", 409);
      throw err;
    }

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "fee_heads",
      entityId: row.publicId,
      after: { name: row.name, nameNe: row.nameNe, sortOrder: row.sortOrder },
    });

    return row;
  });

  return created(head);
});
