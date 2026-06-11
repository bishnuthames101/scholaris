import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";

const PromoteSchema = z.object({
  fromAcademicYearId: z.uuid(),
  toAcademicYearId: z.uuid(),
  mappings: z
    .array(z.object({ fromSectionId: z.uuid(), toSectionId: z.uuid() }))
    .min(1),
});

/** POST /api/enrollments/promote — bulk-promote students between academic years. */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite();
  const body = await parseBody(req, PromoteSchema);

  if (body.fromAcademicYearId === body.toAcademicYearId)
    throw new ApiError("INVALID_INPUT", "Source and target academic years must differ", 400);

  const result = await withTenant(tenantId, async (tx) => {
    const fromYear = await tx.academicYear.findFirst({
      where: { tenantId, publicId: body.fromAcademicYearId, deletedAt: null },
      select: { id: true, publicId: true, name: true },
    });
    if (!fromYear) throw new ApiError("NOT_FOUND", "Source academic year not found", 404);

    const toYear = await tx.academicYear.findFirst({
      where: { tenantId, publicId: body.toAcademicYearId, deletedAt: null },
      select: { id: true, publicId: true, name: true },
    });
    if (!toYear) throw new ApiError("NOT_FOUND", "Target academic year not found", 404);

    const sectionPids = [
      ...new Set(body.mappings.flatMap((m) => [m.fromSectionId, m.toSectionId])),
    ];
    const sections = await tx.section.findMany({
      where: { tenantId, publicId: { in: sectionPids }, deletedAt: null },
      select: { id: true, publicId: true },
    });
    const sectionByPid = new Map(sections.map((s) => [s.publicId, s.id]));
    const missing = sectionPids.filter((pid) => !sectionByPid.has(pid));
    if (missing.length > 0)
      throw new ApiError("NOT_FOUND", "Section not found", 404, { sectionIds: missing });

    // internal from-section id (as string) -> internal to-section id
    const targetBySource = new Map<string, bigint>();
    for (const m of body.mappings) {
      targetBySource.set(
        sectionByPid.get(m.fromSectionId)!.toString(),
        sectionByPid.get(m.toSectionId)!,
      );
    }
    const fromSectionIds = body.mappings.map((m) => sectionByPid.get(m.fromSectionId)!);

    const activeEnrollments = await tx.enrollment.findMany({
      where: {
        tenantId,
        academicYearId: fromYear.id,
        sectionId: { in: fromSectionIds },
        status: "enrolled",
        deletedAt: null,
      },
      select: { id: true, studentId: true, sectionId: true },
    });

    // Any existing row (even soft-deleted) in the target year blocks creation
    // due to the unique (studentId, academicYearId) constraint.
    const existingInTarget = await tx.enrollment.findMany({
      where: { tenantId, academicYearId: toYear.id },
      select: { studentId: true },
    });
    const alreadyEnrolled = new Set(existingInTarget.map((e) => e.studentId.toString()));

    const toPromoteIds: bigint[] = [];
    const toCreate: {
      tenantId: bigint;
      studentId: bigint;
      academicYearId: bigint;
      sectionId: bigint;
    }[] = [];
    let skipped = 0;

    for (const e of activeEnrollments) {
      if (alreadyEnrolled.has(e.studentId.toString())) {
        skipped++;
        continue;
      }
      toPromoteIds.push(e.id);
      toCreate.push({
        tenantId,
        studentId: e.studentId,
        academicYearId: toYear.id,
        sectionId: targetBySource.get(e.sectionId.toString())!,
      });
      alreadyEnrolled.add(e.studentId.toString());
    }

    if (toPromoteIds.length > 0) {
      await tx.enrollment.updateMany({
        where: { id: { in: toPromoteIds } },
        data: { status: "promoted" },
      });
      await tx.enrollment.createMany({ data: toCreate });
    }

    await audit(tx, {
      tenantId,
      action: "promote",
      entity: "enrollments",
      after: {
        fromAcademicYearId: fromYear.publicId,
        toAcademicYearId: toYear.publicId,
        promoted: toPromoteIds.length,
        skipped,
      },
    });

    return { promoted: toPromoteIds.length, skipped };
  });

  return ok(result);
});
