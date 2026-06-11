import { PrismaClient } from "@prisma/client";

// Singleton Prisma client (Next.js hot-reload safe)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Run queries scoped to a tenant under Postgres RLS.
 *
 * Opens a transaction and sets `app.tenant_id` (and `app.is_superadmin`)
 * as transaction-local GUCs, which the RLS policies read via
 * `current_setting('app.tenant_id', true)`. Defense-in-depth: even if app
 * code forgets a `where tenantId`, RLS blocks cross-tenant rows.
 */
export async function withTenant<T>(
  tenantId: bigint | null,
  fn: (tx: TxClient) => Promise<T>,
  opts: { superadmin?: boolean } = {},
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.tenant_id', $1, true), set_config('app.is_superadmin', $2, true)`,
      tenantId === null ? "" : tenantId.toString(),
      opts.superadmin ? "true" : "false",
    );
    return fn(tx as TxClient);
  });
}
