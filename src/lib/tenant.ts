import { ApiError } from "./api";
import { requireSession } from "./auth/session";
import type { AccessClaims } from "./auth/jwt";

export type TenantSession = { session: AccessClaims; tenantId: bigint };

/** Require an authenticated session bound to a tenant (not superadmin-only). */
export async function requireTenantSession(): Promise<TenantSession> {
  const session = await requireSession();
  if (!session.tenantDbId)
    throw new ApiError("NO_TENANT", "This action requires a school account", 403);
  return { session, tenantId: BigInt(session.tenantDbId) };
}

const WRITE_ROLES = ["school_admin", "principal", "front_desk"];

/** Require a tenant session with one of the SIS write roles. */
export async function requireTenantWrite(
  roles: string[] = WRITE_ROLES,
): Promise<TenantSession> {
  const ts = await requireTenantSession();
  if (ts.session.superadmin) return ts;
  if (!roles.some((r) => ts.session.roles.includes(r)))
    throw new ApiError("FORBIDDEN", "Insufficient permissions", 403);
  return ts;
}

/** Parse ?page=&pageSize= with sane bounds. */
export function pagination(url: URL): { page: number; pageSize: number; skip: number } {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? 20) || 20),
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
}
