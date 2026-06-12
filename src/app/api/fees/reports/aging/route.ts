import { handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireTenantSession } from "@/lib/tenant";
import { kathmanduDateString, toDbDate } from "@/lib/attendance";
import { Prisma } from "@prisma/client";

/**
 * GET /api/fees/reports/aging — receivables aging per student.
 * Buckets by days overdue (vs due_date, Kathmandu today): current (not yet
 * due / no due date), 1–30, 31–60, 61–90, 90+. One grouped SQL pass.
 */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const todayStr = url.searchParams.get("asOf") ?? kathmanduDateString();
  const today = toDbDate(todayStr);

  const rows = await withTenant(tenantId, (tx) =>
    tx.$queryRaw<
      {
        student_id: string;
        name: string;
        admission_no: string;
        class_name: string | null;
        current_paisa: number;
        d1_30_paisa: number;
        d31_60_paisa: number;
        d61_90_paisa: number;
        d90p_paisa: number;
        total_paisa: number;
      }[]
    >(Prisma.sql`
      SELECT
        s.public_id AS student_id,
        s.name,
        s.admission_no,
        (
          SELECT c.name FROM enrollments e
          JOIN sections sec ON sec.id = e.section_id
          JOIN classes c ON c.id = sec.class_id
          JOIN academic_years ay ON ay.id = e.academic_year_id
          WHERE e.student_id = s.id AND ay.is_current AND e.deleted_at IS NULL
          LIMIT 1
        ) AS class_name,
        SUM(CASE WHEN i.due_date IS NULL OR i.due_date >= ${today}
            THEN i.total_paisa - i.paid_paisa ELSE 0 END)::int AS current_paisa,
        SUM(CASE WHEN i.due_date < ${today} AND ${today}::date - i.due_date <= 30
            THEN i.total_paisa - i.paid_paisa ELSE 0 END)::int AS d1_30_paisa,
        SUM(CASE WHEN ${today}::date - i.due_date BETWEEN 31 AND 60
            THEN i.total_paisa - i.paid_paisa ELSE 0 END)::int AS d31_60_paisa,
        SUM(CASE WHEN ${today}::date - i.due_date BETWEEN 61 AND 90
            THEN i.total_paisa - i.paid_paisa ELSE 0 END)::int AS d61_90_paisa,
        SUM(CASE WHEN ${today}::date - i.due_date > 90
            THEN i.total_paisa - i.paid_paisa ELSE 0 END)::int AS d90p_paisa,
        SUM(i.total_paisa - i.paid_paisa)::int AS total_paisa
      FROM invoices i
      JOIN students s ON s.id = i.student_id
      WHERE i.tenant_id = ${tenantId}
        AND i.status IN ('issued', 'partially_paid')
      GROUP BY s.id, s.public_id, s.name, s.admission_no
      ORDER BY total_paisa DESC
    `),
  );

  const totals = rows.reduce(
    (acc, r) => ({
      currentPaisa: acc.currentPaisa + r.current_paisa,
      d1_30Paisa: acc.d1_30Paisa + r.d1_30_paisa,
      d31_60Paisa: acc.d31_60Paisa + r.d31_60_paisa,
      d61_90Paisa: acc.d61_90Paisa + r.d61_90_paisa,
      d90pPaisa: acc.d90pPaisa + r.d90p_paisa,
      totalPaisa: acc.totalPaisa + r.total_paisa,
    }),
    { currentPaisa: 0, d1_30Paisa: 0, d31_60Paisa: 0, d61_90Paisa: 0, d90pPaisa: 0, totalPaisa: 0 },
  );

  return ok({
    asOf: todayStr,
    totals,
    rows: rows.map((r) => ({
      studentId: r.student_id,
      name: r.name,
      admissionNo: r.admission_no,
      className: r.class_name,
      currentPaisa: r.current_paisa,
      d1_30Paisa: r.d1_30_paisa,
      d31_60Paisa: r.d31_60_paisa,
      d61_90Paisa: r.d61_90_paisa,
      d90pPaisa: r.d90p_paisa,
      totalPaisa: r.total_paisa,
    })),
  });
});
