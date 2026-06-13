import { z } from "zod";
import { handler, ok, ApiError, parseBody } from "@/lib/api";
import { requireTenantWrite } from "@/lib/tenant";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";

const createLoginSchema = z.object({
  entityType: z.enum(["guardian", "student", "staff"]),
  entityPublicId: z.string().uuid(),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128),
});

/**
 * POST /api/portal/users/create-login
 * Admin creates a portal login for a guardian, student, or staff member.
 * Links the User record to the entity via userId.
 */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite();
  const body = await parseBody(req, createLoginSchema);

  const result = await withTenant(
    null,
    async (tx) => {
      // Resolve the entity and determine role + login credentials
      let name: string;
      let phone: string | null = null;
      let email: string | null = body.email ?? null;
      let roleKey: string;
      let entityId: bigint;
      let updateTable: "guardian" | "student" | "staff";

      if (body.entityType === "guardian") {
        const g = await tx.guardian.findFirst({
          where: { tenantId, publicId: body.entityPublicId, deletedAt: null },
        });
        if (!g) throw new ApiError("NOT_FOUND", "Guardian not found", 404);
        if (g.userId) throw new ApiError("ALREADY_LINKED", "This guardian already has a login", 409);
        name = g.name;
        phone = g.phone;
        email = email ?? g.email;
        roleKey = "parent";
        entityId = g.id;
        updateTable = "guardian";
      } else if (body.entityType === "student") {
        const s = await tx.student.findFirst({
          where: { tenantId, publicId: body.entityPublicId, deletedAt: null },
        });
        if (!s) throw new ApiError("NOT_FOUND", "Student not found", 404);
        if (s.userId) throw new ApiError("ALREADY_LINKED", "This student already has a login", 409);
        name = s.name;
        phone = s.phone;
        roleKey = "student";
        entityId = s.id;
        updateTable = "student";
      } else {
        const st = await tx.staff.findFirst({
          where: { tenantId, publicId: body.entityPublicId, deletedAt: null },
        });
        if (!st) throw new ApiError("NOT_FOUND", "Staff not found", 404);
        if (st.userId) throw new ApiError("ALREADY_LINKED", "This staff already has a login", 409);
        name = st.name;
        phone = st.phone;
        email = email ?? st.email;
        roleKey = st.designation.toLowerCase().includes("teacher") ? "teacher" : "school_admin";
        entityId = st.id;
        updateTable = "staff";
      }

      if (!email && !phone)
        throw new ApiError("NO_CREDENTIAL", "Email or phone required for login", 400);

      // Ensure role exists for this tenant (or system role)
      let role = await tx.role.findFirst({
        where: {
          key: roleKey,
          OR: [{ tenantId }, { tenantId: null }],
        },
      });
      if (!role) {
        role = await tx.role.create({
          data: {
            tenantId,
            key: roleKey,
            name: roleKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            isSystem: true,
          },
        });
      }

      const passwordHash = await hashPassword(body.password);

      // Create User record
      const user = await tx.user.create({
        data: {
          tenantId,
          name,
          email: email ?? undefined,
          phone: phone ?? undefined,
          passwordHash,
          locale: "en",
        },
      });

      // Assign role
      await tx.userRole.create({
        data: { userId: user.id, roleId: role.id },
      });

      // Link entity to user
      if (updateTable === "guardian") {
        await tx.guardian.update({ where: { id: entityId }, data: { userId: user.id } });
      } else if (updateTable === "student") {
        await tx.student.update({ where: { id: entityId }, data: { userId: user.id } });
      } else {
        await tx.staff.update({ where: { id: entityId }, data: { userId: user.id } });
      }

      await audit(tx, {
        tenantId,
        action: "create_portal_login",
        entity: updateTable === "guardian" ? "guardians" : updateTable === "student" ? "students" : "staff",
        entityId: body.entityPublicId,
        after: { userId: user.publicId, role: roleKey },
      });

      return {
        userPublicId: user.publicId,
        name,
        email,
        role: roleKey,
        entityType: body.entityType,
      };
    },
    { superadmin: true, timeoutMs: 15_000 },
  );

  return ok(result);
});
