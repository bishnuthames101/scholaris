import { z } from "zod";
import { handler, ok, ApiError, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";

const registerSchema = z.object({
  schoolSlug: z.string().min(1),
  phone: z.string().regex(/^\+?[0-9\-]{7,20}$/),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128),
  /** Student admission number — used for verification. */
  admissionNo: z.string().min(1),
  /** Guardian's own name (for display). */
  name: z.string().min(1).max(100),
});

/**
 * POST /api/portal/register — guardian self-registration.
 * Links to an existing Guardian record via phone + student admission number match.
 * If the guardian already has a userId, rejects (must use login).
 */
export const POST = handler(async (req: Request) => {
  const body = await parseBody(req, registerSchema);

  const result = await withTenant(
    null,
    async (tx) => {
      // Find the school
      const tenant = await tx.tenant.findFirst({
        where: { slug: body.schoolSlug, deletedAt: null, status: "active" },
        select: { id: true, publicId: true, name: true },
      });
      if (!tenant) throw new ApiError("SCHOOL_NOT_FOUND", "School not found", 404);

      // Find student by admission number in this school
      const student = await tx.student.findFirst({
        where: { tenantId: tenant.id, admissionNo: body.admissionNo, deletedAt: null },
        select: {
          id: true,
          name: true,
          guardians: {
            select: {
              guardian: {
                select: { id: true, phone: true, userId: true, name: true, email: true },
              },
            },
          },
        },
      });
      if (!student)
        throw new ApiError(
          "STUDENT_NOT_FOUND",
          "No student found with this admission number. Please check with the school.",
          404,
        );

      // Match guardian by exact phone — normalize by comparing last 10 digits
      const normalize = (p: string) => p.replace(/[^0-9]/g, "").slice(-10);
      const inputNorm = normalize(body.phone);
      const guardianLink = student.guardians.find(
        (sg) => normalize(sg.guardian.phone) === inputNorm,
      );
      if (!guardianLink)
        throw new ApiError(
          "GUARDIAN_NOT_MATCHED",
          "Your phone number does not match any guardian on file for this student. Please contact the school.",
          403,
        );

      const guardian = guardianLink.guardian;
      if (guardian.userId)
        throw new ApiError(
          "ALREADY_REGISTERED",
          "This guardian already has a login. Please use the login page.",
          409,
        );

      // Ensure 'parent' role exists
      let role = await tx.role.findFirst({
        where: {
          key: "parent",
          OR: [{ tenantId: tenant.id }, { tenantId: null }],
        },
      });
      if (!role) {
        role = await tx.role.create({
          data: { tenantId: tenant.id, key: "parent", name: "Parent", isSystem: true },
        });
      }

      // Check no duplicate email/phone user for this tenant
      if (body.email) {
        const existing = await tx.user.findFirst({
          where: { tenantId: tenant.id, email: body.email, deletedAt: null },
        });
        if (existing)
          throw new ApiError("EMAIL_TAKEN", "A user with this email already exists at this school", 409);
      }

      const passwordHash = await hashPassword(body.password);

      // Create user + assign role + link guardian
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: body.name,
          email: body.email ?? guardian.email ?? undefined,
          phone: body.phone,
          passwordHash,
          locale: "en",
        },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      await tx.guardian.update({ where: { id: guardian.id }, data: { userId: user.id } });

      await audit(tx, {
        tenantId: tenant.id,
        actorId: user.id,
        action: "self_register",
        entity: "guardians",
        entityId: guardian.id.toString(),
        after: { userPublicId: user.publicId, studentAdmissionNo: body.admissionNo },
      });

      return {
        userPublicId: user.publicId,
        name: body.name,
        school: tenant.name,
      };
    },
    { superadmin: true, timeoutMs: 15_000 },
  );

  return ok(result);
});
