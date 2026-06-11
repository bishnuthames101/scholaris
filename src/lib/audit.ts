import type { Prisma } from "@prisma/client";
import { serialize } from "./serialize";

type AuditClient = {
  auditLog: {
    create: (args: { data: Prisma.AuditLogUncheckedCreateInput }) => Promise<unknown>;
  };
};

export type AuditInput = {
  tenantId?: bigint | null;
  actorId?: bigint | null;
  action: "create" | "update" | "soft_delete" | "restore" | "login" | "logout" | string;
  entity: string;
  entityId?: string | null; // publicId of affected row
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
};

/**
 * Append an immutable audit entry (§3.3). Call inside the same `withTenant`
 * transaction as the write it describes, so audit + write commit atomically.
 */
export async function audit(tx: AuditClient, input: AuditInput): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: input.tenantId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      before:
        input.before === undefined
          ? undefined
          : (serialize(input.before) as Prisma.InputJsonValue),
      after:
        input.after === undefined ? undefined : (serialize(input.after) as Prisma.InputJsonValue),
      reason: input.reason ?? null,
      ip: input.ip ?? null,
    },
  });
}
