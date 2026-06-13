/**
 * Lazy-seed system notification templates per tenant.
 * Called on first use (like grade scales in Phase 4).
 */

import { SYSTEM_TEMPLATES } from "./templates";

type SeedClient = {
  notificationTemplate: {
    findFirst: (args: {
      where: { tenantId: bigint; isSystem: boolean };
      select: { id: true };
    }) => Promise<{ id: bigint } | null>;
    createMany: (args: {
      data: Array<{
        tenantId: bigint;
        name: string;
        nameNe: string;
        slug: string;
        bodyEn: string;
        bodyNe: string;
        variables: string[];
        isSystem: boolean;
      }>;
      skipDuplicates: boolean;
    }) => Promise<{ count: number }>;
  };
};

/** Ensure system templates exist for a tenant (idempotent). */
export async function ensureSystemTemplates(
  tx: SeedClient,
  tenantId: bigint,
): Promise<void> {
  const existing = await tx.notificationTemplate.findFirst({
    where: { tenantId, isSystem: true },
    select: { id: true },
  });
  if (existing) return; // already seeded

  await tx.notificationTemplate.createMany({
    data: SYSTEM_TEMPLATES.map((t) => ({
      tenantId,
      name: t.name,
      nameNe: t.nameNe,
      slug: t.slug,
      bodyEn: t.bodyEn,
      bodyNe: t.bodyNe,
      variables: t.variables,
      isSystem: true,
    })),
    skipDuplicates: true,
  });
}
