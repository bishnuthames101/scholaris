import { z } from "zod";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { requireSession } from "@/lib/auth/session";

const CreateTenantSchema = z.object({
  name: z.string().min(2),
  nameNe: z.string().optional(),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, hyphens"),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  panVatNo: z.string().optional(),
  admin: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

/** POST /api/tenants — superadmin creates a school + its first admin. */
export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  if (!session.superadmin)
    throw new ApiError("FORBIDDEN", "Only the platform superadmin can create schools", 403);

  const body = await parseBody(req, CreateTenantSchema);

  const result = await withTenant(
    null,
    async (tx) => {
      const existing = await tx.tenant.findUnique({ where: { slug: body.slug } });
      if (existing) throw new ApiError("SLUG_TAKEN", "A school with this slug already exists", 409);

      const tenant = await tx.tenant.create({
        data: {
          name: body.name,
          nameNe: body.nameNe,
          slug: body.slug,
          address: body.address,
          phone: body.phone,
          email: body.email,
          panVatNo: body.panVatNo,
        },
      });

      const adminRole = await tx.role.findFirst({
        where: { key: "school_admin", tenantId: null, isSystem: true },
      });
      if (!adminRole) throw new ApiError("SETUP_ERROR", "System roles not seeded", 500);

      const adminUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: body.admin.name,
          email: body.admin.email,
          passwordHash: await hashPassword(body.admin.password),
          userRoles: { create: { roleId: adminRole.id } },
        },
      });

      await audit(tx, {
        tenantId: tenant.id,
        action: "create",
        entity: "tenants",
        entityId: tenant.publicId,
        after: { name: tenant.name, slug: tenant.slug },
        reason: "Tenant created by superadmin",
      });
      await audit(tx, {
        tenantId: tenant.id,
        action: "create",
        entity: "users",
        entityId: adminUser.publicId,
        after: { name: adminUser.name, email: adminUser.email, role: "school_admin" },
      });

      return { tenant, adminUser };
    },
    { superadmin: true },
  );

  return created({
    tenant: result.tenant,
    admin: { publicId: result.adminUser.publicId, email: result.adminUser.email },
  });
});

/** GET /api/tenants — superadmin lists schools. */
export const GET = handler(async () => {
  const session = await requireSession();
  if (!session.superadmin) throw new ApiError("FORBIDDEN", "Superadmin only", 403);

  const tenants = await withTenant(
    null,
    (tx) =>
      tx.tenant.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
      }),
    { superadmin: true },
  );
  return ok(tenants);
});
