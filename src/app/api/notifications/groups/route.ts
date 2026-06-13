import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { handler, ok, created, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite, pagination } from "@/lib/tenant";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  nameNe: z.string().optional(),
  type: z.enum(["custom", "class_parents", "staff", "all_parents"]).default("custom"),
  filter: z.record(z.string(), z.unknown()).default({}),
  members: z
    .array(
      z.object({
        guardianId: z.string().uuid().optional(),
        phone: z.string().min(1).max(20).optional(),
        name: z.string().min(1).max(100).optional(),
      }),
    )
    .max(10000)
    .optional(),
});

export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);

  const result = await withTenant(tenantId, async (tx) => {
    const [items, total] = await Promise.all([
      tx.contactGroup.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { name: "asc" },
        skip,
        take: pageSize,
        include: { _count: { select: { members: true } } },
      }),
      tx.contactGroup.count({ where: { tenantId, deletedAt: null } }),
    ]);
    return { items, total };
  });

  return ok(result.items, { page, pageSize, total: result.total });
});

export const POST = handler(async (req: Request) => {
  const { tenantId, session } = await requireTenantWrite();
  const body = await parseBody(req, createSchema);

  const group = await withTenant(tenantId, async (tx) => {
    const g = await tx.contactGroup.create({
      data: {
        tenantId,
        name: body.name,
        nameNe: body.nameNe ?? null,
        type: body.type,
        filter: body.filter as Prisma.InputJsonValue,
      },
    });

    if (body.members && body.members.length > 0) {
      for (const m of body.members) {
        let guardianBigId: bigint | null = null;
        if (m.guardianId) {
          const guardian = await tx.guardian.findFirst({
            where: { tenantId, publicId: m.guardianId, deletedAt: null },
            select: { id: true },
          });
          if (guardian) guardianBigId = guardian.id;
        }
        await tx.contactGroupMember.create({
          data: {
            tenantId,
            groupId: g.id,
            guardianId: guardianBigId,
            phone: m.phone ?? null,
            name: m.name ?? null,
          },
        });
      }
    }

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "contact_groups",
      entityId: g.publicId,
      after: body,
    });

    return tx.contactGroup.findUniqueOrThrow({
      where: { id: g.id },
      include: { _count: { select: { members: true } } },
    });
  });

  return created(group);
});
