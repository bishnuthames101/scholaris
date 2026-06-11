import { z } from "zod";
import { created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { pagination, requireTenantSession, requireTenantWrite } from "@/lib/tenant";

/** GET /api/staff — list staff with search + pagination. */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);
  const search = url.searchParams.get("search")?.trim();

  const where = {
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { designation: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const { rows, total } = await withTenant(tenantId, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.staff.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take: pageSize,
      }),
      tx.staff.count({ where }),
    ]);
    return { rows, total };
  });

  return ok(rows, { page, pageSize, total });
});

const CreateStaffSchema = z.object({
  name: z.string().min(1),
  nameNe: z.string().optional(),
  designation: z.string().min(1),
  phone: z.string().optional(),
  email: z.email().optional(),
  joinedAt: z.coerce.date().optional(),
});

/** POST /api/staff — create a staff member. */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite();
  const body = await parseBody(req, CreateStaffSchema);

  const staff = await withTenant(tenantId, async (tx) => {
    const row = await tx.staff.create({
      data: {
        tenantId,
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
      action: "create",
      entity: "staff",
      entityId: row.publicId,
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

  return created(staff);
});
