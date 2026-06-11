import { prisma, withTenant } from "../db";
import { ApiError } from "../api";
import { audit } from "../audit";
import { signAccessToken } from "./jwt";
import { generateOpaqueToken, sha256, verifyPassword } from "./password";

const REFRESH_TTL_MS = () =>
  1000 * 60 * 60 * 24 * Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30);

export type LoginResult = {
  accessToken: string;
  refreshToken: string;
  user: {
    publicId: string;
    name: string;
    locale: string;
    roles: string[];
    superadmin: boolean;
    tenant: { publicId: string; name: string; slug: string } | null;
  };
};

/**
 * Login with email + password. If the same email exists in multiple schools,
 * the caller must disambiguate with the school slug.
 */
export async function login(
  email: string,
  password: string,
  schoolSlug: string | undefined,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<LoginResult> {
  // Pre-auth lookup runs with superadmin context (no tenant known yet).
  return withTenant(
    null,
    async (tx) => {
      const candidates = await tx.user.findMany({
        where: {
          email,
          deletedAt: null,
          status: "active",
          ...(schoolSlug ? { tenant: { slug: schoolSlug, deletedAt: null } } : {}),
        },
        include: {
          tenant: true,
          userRoles: { include: { role: true } },
        },
      });

      if (candidates.length === 0)
        throw new ApiError("INVALID_CREDENTIALS", "Invalid email or password", 401);
      if (candidates.length > 1)
        throw new ApiError(
          "SCHOOL_REQUIRED",
          "This email is registered with multiple schools. Please specify your school.",
          409,
        );

      const user = candidates[0];
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) throw new ApiError("INVALID_CREDENTIALS", "Invalid email or password", 401);
      if (user.tenant && user.tenant.status === "suspended")
        throw new ApiError("TENANT_SUSPENDED", "This school account is suspended", 403);

      const roles = user.userRoles.map((ur) => ur.role.key);

      const accessToken = await signAccessToken({
        sub: user.publicId,
        tenantId: user.tenant?.publicId ?? null,
        tenantDbId: user.tenantId?.toString() ?? null,
        roles,
        superadmin: user.isSuperadmin,
        locale: user.locale,
      });

      const { token: refreshToken, tokenHash } = generateOpaqueToken();
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          tokenHash,
          expiresAt: new Date(Date.now() + REFRESH_TTL_MS()),
          userAgent: meta.userAgent ?? null,
          ip: meta.ip ?? null,
        },
      });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await audit(tx, {
        tenantId: user.tenantId,
        actorId: user.id,
        action: "login",
        entity: "users",
        entityId: user.publicId,
        ip: meta.ip,
      });

      return {
        accessToken,
        refreshToken,
        user: {
          publicId: user.publicId,
          name: user.name,
          locale: user.locale,
          roles,
          superadmin: user.isSuperadmin,
          tenant: user.tenant
            ? { publicId: user.tenant.publicId, name: user.tenant.name, slug: user.tenant.slug }
            : null,
        },
      };
    },
    { superadmin: true },
  );
}

/** Rotate a refresh token → new access + refresh pair. */
export async function refresh(
  refreshTokenValue: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<LoginResult> {
  return withTenant(
    null,
    async (tx) => {
      const tokenHash = sha256(refreshTokenValue);
      const stored = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: {
          user: { include: { tenant: true, userRoles: { include: { role: true } } } },
        },
      });

      if (!stored || stored.revokedAt || stored.expiresAt < new Date())
        throw new ApiError("INVALID_REFRESH", "Session expired, please log in again", 401);

      const user = stored.user;
      if (user.deletedAt || user.status !== "active")
        throw new ApiError("INVALID_REFRESH", "Session expired, please log in again", 401);

      // Rotate: revoke old, issue new
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      const { token: newRefresh, tokenHash: newHash } = generateOpaqueToken();
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          tokenHash: newHash,
          expiresAt: new Date(Date.now() + REFRESH_TTL_MS()),
          userAgent: meta.userAgent ?? null,
          ip: meta.ip ?? null,
        },
      });

      const roles = user.userRoles.map((ur) => ur.role.key);
      const accessToken = await signAccessToken({
        sub: user.publicId,
        tenantId: user.tenant?.publicId ?? null,
        tenantDbId: user.tenantId?.toString() ?? null,
        roles,
        superadmin: user.isSuperadmin,
        locale: user.locale,
      });

      return {
        accessToken,
        refreshToken: newRefresh,
        user: {
          publicId: user.publicId,
          name: user.name,
          locale: user.locale,
          roles,
          superadmin: user.isSuperadmin,
          tenant: user.tenant
            ? { publicId: user.tenant.publicId, name: user.tenant.name, slug: user.tenant.slug }
            : null,
        },
      };
    },
    { superadmin: true },
  );
}

export async function logout(refreshTokenValue: string | undefined): Promise<void> {
  if (!refreshTokenValue) return;
  await withTenant(
    null,
    async (tx) => {
      await tx.refreshToken.updateMany({
        where: { tokenHash: sha256(refreshTokenValue), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },
    { superadmin: true },
  );
}

export { prisma };
