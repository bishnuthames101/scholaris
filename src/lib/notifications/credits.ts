/**
 * Per-tenant message credit metering (§9).
 * Credits are deducted on successful sends and tracked in credit_transactions.
 */

type CreditTxClient = {
  messageCredit: {
    upsert: (args: {
      where: { tenantId: bigint };
      create: { tenantId: bigint; balance: number; totalUsed: number };
      update: { balance: { increment: number }; totalUsed: { increment: number } };
    }) => Promise<{ balance: number }>;
    findUnique: (args: {
      where: { tenantId: bigint };
    }) => Promise<{ balance: number; totalUsed: number } | null>;
  };
  creditTransaction: {
    create: (args: {
      data: {
        tenantId: bigint;
        amount: number;
        balanceAfter: number;
        reason: string;
        reference?: string | null;
        createdBy?: string | null;
      };
    }) => Promise<unknown>;
  };
};

/** Check if tenant has sufficient credits. Returns current balance. */
export async function getBalance(
  tx: CreditTxClient,
  tenantId: bigint,
): Promise<number> {
  const credit = await tx.messageCredit.findUnique({
    where: { tenantId },
  });
  return credit?.balance ?? 0;
}

/** Deduct credits for sent messages. Returns new balance. */
export async function deductCredits(
  tx: CreditTxClient,
  tenantId: bigint,
  amount: number,
  reason: string,
  reference?: string,
  createdBy?: string,
): Promise<number> {
  const updated = await tx.messageCredit.upsert({
    where: { tenantId },
    create: { tenantId, balance: -amount, totalUsed: amount },
    update: {
      balance: { increment: -amount },
      totalUsed: { increment: amount },
    },
  });

  await tx.creditTransaction.create({
    data: {
      tenantId,
      amount: -amount,
      balanceAfter: updated.balance,
      reason,
      reference: reference ?? null,
      createdBy: createdBy ?? null,
    },
  });

  return updated.balance;
}

/** Add credits to a tenant (top-up). Returns new balance. */
export async function addCredits(
  tx: CreditTxClient,
  tenantId: bigint,
  amount: number,
  reason: string,
  createdBy?: string,
): Promise<number> {
  const updated = await tx.messageCredit.upsert({
    where: { tenantId },
    create: { tenantId, balance: amount, totalUsed: 0 },
    update: {
      balance: { increment: amount },
      totalUsed: { increment: 0 },
    },
  });

  await tx.creditTransaction.create({
    data: {
      tenantId,
      amount,
      balanceAfter: updated.balance,
      reason,
      createdBy: createdBy ?? null,
    },
  });

  return updated.balance;
}
