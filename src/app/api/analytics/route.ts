import { handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireTenantSession } from "@/lib/tenant";

/** GET /api/analytics — school-level dashboard metrics. */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const daysBack = Math.min(90, Math.max(7, Number(url.searchParams.get("days") ?? 30)));

  const analytics = await withTenant(tenantId, async (tx) => {
    const since = new Date(Date.now() - daysBack * 86400000);

    // --- Counts ---
    const [totalStudents, totalStaff, totalGuardians] = await Promise.all([
      tx.student.count({ where: { tenantId, deletedAt: null, status: "active" } }),
      tx.staff.count({ where: { tenantId, deletedAt: null } }),
      tx.guardian.count({ where: { tenantId, deletedAt: null } }),
    ]);

    // --- Attendance trends (daily rates for the period) ---
    const attendanceRecords = await tx.attendanceRecord.groupBy({
      by: ["date", "status"],
      where: { tenantId, date: { gte: since } },
      _count: true,
    });

    // Aggregate by date
    const attendanceByDate = new Map<string, { present: number; absent: number; late: number; total: number }>();
    for (const rec of attendanceRecords) {
      const d = rec.date.toISOString().slice(0, 10);
      const entry = attendanceByDate.get(d) ?? { present: 0, absent: 0, late: 0, total: 0 };
      const count = rec._count;
      if (rec.status === "present") entry.present += count;
      else if (rec.status === "absent") entry.absent += count;
      else if (rec.status === "late") entry.late += count;
      entry.total += count;
      attendanceByDate.set(d, entry);
    }

    const attendanceTrend = Array.from(attendanceByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({
        date,
        ...counts,
        rate: counts.total > 0 ? Math.round(((counts.present + counts.late) / counts.total) * 100) : 0,
      }));

    // Overall attendance rate
    const totalAttMarks = attendanceTrend.reduce((s, d) => s + d.total, 0);
    const totalPresent = attendanceTrend.reduce((s, d) => s + d.present + d.late, 0);
    const overallAttendanceRate = totalAttMarks > 0 ? Math.round((totalPresent / totalAttMarks) * 100) : 0;

    // --- Fee collection ---
    const [totalInvoiced, totalCollected, totalPending] = await Promise.all([
      tx.invoice.aggregate({
        where: { tenantId },
        _sum: { totalPaisa: true },
      }),
      tx.payment.aggregate({
        where: { tenantId, status: "completed" },
        _sum: { amountPaisa: true },
      }),
      tx.invoice.aggregate({
        where: { tenantId, status: "issued" },
        _sum: { totalPaisa: true },
      }),
    ]);

    // Recent collections (last N days)
    const recentPayments = await tx.payment.groupBy({
      by: ["paidAt"],
      where: {
        tenantId,
        status: "completed",
        paidAt: { gte: since },
      },
      _sum: { amountPaisa: true },
    });

    // Normalize to daily
    const collectionByDate = new Map<string, number>();
    for (const p of recentPayments) {
      if (p.paidAt) {
        const d = new Date(p.paidAt).toISOString().slice(0, 10);
        collectionByDate.set(d, (collectionByDate.get(d) ?? 0) + (p._sum?.amountPaisa ?? 0));
      }
    }

    const collectionTrend = Array.from(collectionByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amountPaisa]) => ({ date, amountPaisa }));

    // --- At-risk students (rule-based: low attendance OR unpaid fees) ---
    // Low attendance: < 75% in last 30 days
    const studentAttendance = await tx.attendanceRecord.groupBy({
      by: ["studentId"],
      where: { tenantId, date: { gte: since } },
      _count: true,
    });

    const studentAbsences = await tx.attendanceRecord.groupBy({
      by: ["studentId"],
      where: { tenantId, date: { gte: since }, status: "absent" },
      _count: true,
    });

    const absenceMap = new Map(studentAbsences.map((a) => [a.studentId.toString(), a._count]));

    const lowAttendanceIds: bigint[] = [];
    for (const sa of studentAttendance) {
      const absences = absenceMap.get(sa.studentId.toString()) ?? 0;
      const rate = ((sa._count - absences) / sa._count) * 100;
      if (rate < 75) lowAttendanceIds.push(sa.studentId);
    }

    // Unpaid fees (issued = not yet paid)
    const unpaidInvoices = await tx.invoice.findMany({
      where: { tenantId, status: "issued" },
      select: { studentId: true },
      distinct: ["studentId"],
    });
    const unpaidStudentIds = new Set(unpaidInvoices.map((i) => i.studentId.toString()));

    // Combine at-risk: build sets of internal BigInt ID strings for reason tracking
    const lowAttSet = new Set(lowAttendanceIds.map((id) => id.toString()));
    const allAtRiskInternalIds = new Set([...lowAttSet, ...unpaidStudentIds]);

    // Get details for at-risk students (max 20)
    const atRiskStudents = allAtRiskInternalIds.size > 0
      ? await tx.student.findMany({
          where: {
            tenantId,
            id: { in: Array.from(allAtRiskInternalIds).slice(0, 20).map(BigInt) },
            deletedAt: null,
          },
        })
      : [];

    // Map reasons using internal id (BigInt) — NOT publicId
    const atRiskList = atRiskStudents.map((s) => {
      const internalIdStr = s.id.toString();
      return {
        publicId: s.publicId,
        name: s.name,
        admissionNo: s.admissionNo,
        reasons: [
          lowAttSet.has(internalIdStr) ? "Low attendance (<75%)" : null,
          unpaidStudentIds.has(internalIdStr) ? "Unpaid fees" : null,
        ].filter(Boolean) as string[],
      };
    });

    // --- Messages sent ---
    const messagesSent = await tx.notification.count({
      where: { tenantId, createdAt: { gte: since }, status: { in: ["sent", "delivered"] } },
    });

    return {
      counts: { students: totalStudents, staff: totalStaff, guardians: totalGuardians },
      attendance: {
        overallRate: overallAttendanceRate,
        trend: attendanceTrend,
      },
      fees: {
        totalInvoicedPaisa: totalInvoiced._sum?.totalPaisa ?? 0,
        totalCollectedPaisa: totalCollected._sum?.amountPaisa ?? 0,
        totalPendingPaisa: totalPending._sum?.totalPaisa ?? 0,
        collectionTrend,
      },
      atRisk: {
        count: allAtRiskInternalIds.size,
        students: atRiskList,
      },
      messages: { sentLast30d: messagesSent },
    };
  });

  return ok(analytics);
});
