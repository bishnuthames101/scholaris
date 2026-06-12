import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handler } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireTenantSession } from "@/lib/tenant";
import {
  renderMarksheetPdf,
  type MarksheetSubjectRow,
} from "@/lib/exams/marksheet-pdf";

type Ctx = { params: Promise<{ id: string; studentId: string }> };

/**
 * GET /api/exams/[id]/marksheets/[studentId] — bilingual A4 grade-sheet PDF.
 * Available once the exam is published. Increments print_count; prints after
 * the first carry a "Copy of Original" label.
 */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { tenantId } = await requireTenantSession();
  const p = await ctx.params;
  const examId = z.uuid().safeParse(p.id);
  const studentId = z.uuid().safeParse(p.studentId);
  if (!examId.success || !studentId.success)
    throw new ApiError("NOT_FOUND", "Marksheet not found", 404);

  const data = await withTenant(tenantId, async (tx) => {
    const result = await tx.examResult.findFirst({
      where: {
        tenantId,
        exam: { publicId: examId.data, deletedAt: null, status: "published" },
        student: { publicId: studentId.data },
      },
      include: {
        exam: {
          select: {
            name: true,
            nameNe: true,
            publishedAt: true,
            academicYearId: true,
            academicYear: { select: { name: true } },
          },
        },
        student: { select: { id: true, name: true, nameNe: true, admissionNo: true } },
      },
    });
    if (!result)
      throw new ApiError("NOT_FOUND", "Published result not found for this student", 404);

    const [tenant, enrollment] = await Promise.all([
      tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { name: true, nameNe: true, address: true, phone: true },
      }),
      tx.enrollment.findFirst({
        where: {
          tenantId,
          studentId: result.student.id,
          academicYearId: result.exam.academicYearId,
          deletedAt: null,
        },
        select: {
          rollNo: true,
          section: { select: { name: true, class: { select: { name: true } } } },
        },
      }),
    ]);

    await tx.examResult.update({
      where: { id: result.id },
      data: { printCount: { increment: 1 } },
    });

    return { result, tenant, enrollment };
  });

  const { result, tenant, enrollment } = data;
  const summary = result.summary as { subjects?: MarksheetSubjectRow[] };

  const pdf = await renderMarksheetPdf({
    school: tenant,
    exam: {
      name: result.exam.name,
      nameNe: result.exam.nameNe,
      publishedAt: result.exam.publishedAt,
    },
    academicYearName: result.exam.academicYear.name,
    student: {
      name: result.student.name,
      nameNe: result.student.nameNe,
      admissionNo: result.student.admissionNo,
      className: enrollment?.section.class.name ?? null,
      sectionName: enrollment?.section.name ?? null,
      rollNo: enrollment?.rollNo ?? null,
    },
    subjects: summary.subjects ?? [],
    gpa: Number(result.gpa),
    status: result.status,
    ngCount: result.ngCount,
    priorPrints: result.printCount,
  });

  const filename = `marksheet_${result.student.admissionNo}`.replace(/[^\w.-]/g, "_");
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});
