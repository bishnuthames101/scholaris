import { handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireTenantSession, pagination } from "@/lib/tenant";

/** GET — current credit balance + recent transactions. */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);

  const result = await withTenant(tenantId, async (tx) => {
    const credit = await tx.messageCredit.findUnique({
      where: { tenantId },
    });

    const [transactions, total] = await Promise.all([
      tx.creditTransaction.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      tx.creditTransaction.count({ where: { tenantId } }),
    ]);

    return {
      balance: credit?.balance ?? 0,
      totalUsed: credit?.totalUsed ?? 0,
      transactions,
      total,
    };
  });

  return ok(
    { balance: result.balance, totalUsed: result.totalUsed, transactions: result.transactions },
    { page, pageSize, total: result.total },
  );
});
