import { cookies } from "next/headers";
import { ApiError } from "../api";
import { verifyAccessToken, type AccessClaims } from "./jwt";

export const ACCESS_COOKIE = "scholaris_access";
export const REFRESH_COOKIE = "scholaris_refresh";

const baseCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, accessToken, { ...baseCookie, maxAge: 60 * 15 });
  jar.set(REFRESH_COOKIE, refreshToken, {
    ...baseCookie,
    maxAge: 60 * 60 * 24 * Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30),
  });
}

export async function clearAuthCookies() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/** Current authenticated claims, or null. */
export async function getSession(): Promise<AccessClaims | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

/** Require an authenticated session (throws 401 into the API envelope). */
export async function requireSession(): Promise<AccessClaims> {
  const session = await getSession();
  if (!session) throw new ApiError("UNAUTHORIZED", "Authentication required", 401);
  return session;
}

/** Require one of the given role keys (superadmin always passes). */
export async function requireRole(...roleKeys: string[]): Promise<AccessClaims> {
  const session = await requireSession();
  if (session.superadmin) return session;
  if (!roleKeys.some((r) => session.roles.includes(r)))
    throw new ApiError("FORBIDDEN", "Insufficient permissions", 403);
  return session;
}

/** Internal tenant id (bigint) for RLS scoping; null for superadmin. */
export function tenantDbId(session: AccessClaims): bigint | null {
  return session.tenantDbId ? BigInt(session.tenantDbId) : null;
}
