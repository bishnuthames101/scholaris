import type { Prisma } from "@prisma/client";
import { NEB_DEFAULT_SCALE, type GradeBandInput } from "./grading";

type Tx = {
  gradeScale: {
    findFirst: (args: Prisma.GradeScaleFindFirstArgs) => Promise<unknown>;
    create: (args: Prisma.GradeScaleCreateArgs) => Promise<unknown>;
  };
};

type ScaleWithBands = {
  id: bigint;
  publicId: string;
  name: string;
  isDefault: boolean;
  bands: {
    letter: string;
    letterNe: string | null;
    gradePoint: Prisma.Decimal;
    minPercent: Prisma.Decimal;
    maxPercent: Prisma.Decimal;
    isPassing: boolean;
    sortOrder: number;
  }[];
};

/** Convert DB bands (Decimal) to the pure-computation input shape. */
export function bandsToInput(bands: ScaleWithBands["bands"]): GradeBandInput[] {
  return bands.map((b) => ({
    letter: b.letter,
    gradePoint: Number(b.gradePoint),
    minPercent: Number(b.minPercent),
    maxPercent: Number(b.maxPercent),
    isPassing: b.isPassing,
  }));
}

/**
 * Lazily create the NEB 4.0 default scale for a tenant (idempotent).
 * Returns the tenant's default scale (or any scale if no default flagged).
 */
export async function ensureDefaultGradeScale(
  tx: Tx,
  tenantId: bigint,
): Promise<ScaleWithBands> {
  const include = { bands: { orderBy: { sortOrder: "asc" as const } } };

  const existing = (await tx.gradeScale.findFirst({
    where: { tenantId, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
    include,
  })) as ScaleWithBands | null;
  if (existing) return existing;

  return (await tx.gradeScale.create({
    data: {
      tenantId,
      name: NEB_DEFAULT_SCALE.name,
      isDefault: true,
      bands: {
        create: NEB_DEFAULT_SCALE.bands.map((b, i) => ({
          tenantId,
          letter: b.letter,
          gradePoint: b.gradePoint,
          minPercent: b.minPercent,
          maxPercent: b.maxPercent,
          isPassing: b.isPassing,
          sortOrder: i,
        })),
      },
    },
    include,
  })) as ScaleWithBands;
}
