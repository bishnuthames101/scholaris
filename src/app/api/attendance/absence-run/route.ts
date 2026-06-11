import { z } from "zod";
import { ApiError, handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantSession, requireTenantWrite } from "@/lib/tenant";
import {
  KATHMANDU_OFFSET_MIN,
  attendanceSettingsOf,
  cutoffToMinutes,
  fromDbDate,
  kathmanduDateString,
  kathmanduMinutesOfDay,
  planAbsenceRun,
  toDbDate,
} from "@/lib/attendance";

/**
 * Daily absence job (§7.6) with the offline-vs-absent guard.
 *
 * POST runs the job for a date (default: today in Kathmandu):
 *  - messaging mode `off`         → recorded as `skipped`, nothing marked/emitted
 *  - no data reported for the day → recorded as `held` (flag for manual review;
 *    a silent reader must never translate into "everyone absent" messages)
 *  - otherwise → un-recorded students in the covered scope are marked absent
 *    and exactly ONE `attendance.absent` event is emitted per absentee
 *    (absent_notified_at guarantees exactly-once across re-runs).
 *
 * Coverage: if any device reported swipes that day, the whole school is covered
 * (gate readers see every student); otherwise only sections that were manually
 * marked are covered — unmarked sections are left untouched.
 */

const RUN_ROLES = ["school_admin", "principal"];

const bodySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  force: z.boolean().optional(), // override the cutoff-time check
});

/** UTC instants bounding a Kathmandu calendar date. */
function kathmanduDayWindow(dateStr: string): { start: Date; end: Date } {
  const start = new Date(toDbDate(dateStr).getTime() - KATHMANDU_OFFSET_MIN * 60_000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60_000) };
}

export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const dateStr = url.searchParams.get("date") ?? kathmanduDateString();
  const dbDate = toDbDate(dateStr);

  const run = await withTenant(tenantId, (tx) =>
    tx.absenceRun.findFirst({
      where: { tenantId, date: dbDate },
      orderBy: { createdAt: "desc" },
    }),
  );
  return ok({ date: dateStr, run: run ? { ...run, date: fromDbDate(run.date) } : null });
});

export const POST = handler(async (req: Request) => {
  const { tenantId, session } = await requireTenantWrite(RUN_ROLES);
  const raw = await req.text();
  const body = bodySchema.parse(raw ? JSON.parse(raw) : {});
  const today = kathmanduDateString();
  const dateStr = body.date ?? today;
  if (dateStr > today)
    throw new ApiError("FUTURE_DATE", "Cannot run the absence job for a future date", 400);
  const dbDate = toDbDate(dateStr);
  const window = kathmanduDayWindow(dateStr);

  const result = await withTenant(
    tenantId,
    async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { settings: true },
      });
      const settings = attendanceSettingsOf(tenant.settings);

      // Cutoff check (only meaningful when running for today).
      if (
        dateStr === today &&
        !body.force &&
        kathmanduMinutesOfDay() < cutoffToMinutes(settings.absenceCutoff)
      ) {
        throw new ApiError(
          "BEFORE_CUTOFF",
          `The absence job runs after the cutoff time (${settings.absenceCutoff})`,
          409,
          { cutoff: settings.absenceCutoff },
        );
      }

      const [reportingDevice, anyRecord] = await Promise.all([
        tx.rfidDevice.findFirst({
          where: {
            tenantId,
            isActive: true,
            deletedAt: null,
            lastReportedAt: { gte: window.start, lt: window.end },
          },
          select: { id: true },
        }),
        tx.attendanceRecord.findFirst({
          where: { tenantId, date: dbDate },
          select: { id: true },
        }),
      ]);

      const plan = planAbsenceRun({
        messagingMode: settings.messagingMode,
        anyDeviceReportedToday: reportingDevice !== null,
        anyRecordsToday: anyRecord !== null,
      });

      if (plan.action !== "run") {
        const run = await tx.absenceRun.create({
          data: {
            tenantId,
            date: dbDate,
            status: plan.action === "skip" ? "skipped" : "held",
            heldReason: plan.action === "hold" ? plan.reason : null,
            summary: { plan },
            ranBy: session.sub,
          },
        });
        await audit(tx, {
          tenantId,
          action: "absence_run",
          entity: "absence_runs",
          entityId: run.publicId,
          after: { date: dateStr, status: run.status, reason: plan.reason },
        });
        return { ...run, date: dateStr, newlyMarkedAbsent: 0 };
      }

      // Coverage scope.
      const schoolWide = reportingDevice !== null;
      let coveredSectionIds: bigint[] = [];
      if (!schoolWide) {
        const marked = await tx.attendanceRecord.findMany({
          where: { tenantId, date: dbDate, sectionId: { not: null } },
          select: { sectionId: true },
          distinct: ["sectionId"],
        });
        coveredSectionIds = marked.map((m) => m.sectionId as bigint);
      }

      // Students in scope with no record today → absent.
      const missing = await tx.enrollment.findMany({
        where: {
          tenantId,
          deletedAt: null,
          academicYear: { isCurrent: true, deletedAt: null },
          ...(schoolWide ? {} : { sectionId: { in: coveredSectionIds } }),
          student: {
            status: "active",
            deletedAt: null,
            attendance: { none: { date: dbDate } },
          },
        },
        select: { studentId: true, sectionId: true },
      });

      if (missing.length > 0) {
        await tx.attendanceRecord.createMany({
          data: missing.map((m) => ({
            tenantId,
            studentId: m.studentId,
            sectionId: m.sectionId,
            date: dbDate,
            status: "absent" as const,
            source: "system" as const,
          })),
          skipDuplicates: true,
        });
      }

      // Exactly-once emission: every absent record not yet notified.
      const toNotify = await tx.attendanceRecord.findMany({
        where: { tenantId, date: dbDate, status: "absent", absentNotifiedAt: null },
        select: {
          id: true,
          source: true,
          student: {
            select: { publicId: true, name: true, nameNe: true, admissionNo: true },
          },
          section: { select: { publicId: true, name: true, class: { select: { name: true } } } },
        },
      });

      let eventsEmitted = 0;
      if (toNotify.length > 0) {
        await tx.domainEvent.createMany({
          data: toNotify.map((r) => ({
            tenantId,
            type: "attendance.absent",
            payload: {
              studentId: r.student.publicId,
              studentName: r.student.name,
              studentNameNe: r.student.nameNe,
              admissionNo: r.student.admissionNo,
              class: r.section?.class.name ?? null,
              section: r.section?.name ?? null,
              date: dateStr,
              source: r.source,
            },
          })),
        });
        await tx.attendanceRecord.updateMany({
          where: { id: { in: toNotify.map((r) => r.id) } },
          data: { absentNotifiedAt: new Date() },
        });
        eventsEmitted = toNotify.length;
      }

      const [absentCount, presentCount] = await Promise.all([
        tx.attendanceRecord.count({ where: { tenantId, date: dbDate, status: "absent" } }),
        tx.attendanceRecord.count({ where: { tenantId, date: dbDate, status: "present" } }),
      ]);

      const run = await tx.absenceRun.create({
        data: {
          tenantId,
          date: dbDate,
          status: "completed",
          absentCount,
          presentCount,
          eventsEmitted,
          summary: {
            coverage: schoolWide ? "school" : "sections",
            coveredSections: schoolWide ? null : coveredSectionIds.length,
            newlyMarkedAbsent: missing.length,
            messagingMode: settings.messagingMode,
          },
          ranBy: session.sub,
        },
      });
      await audit(tx, {
        tenantId,
        action: "absence_run",
        entity: "absence_runs",
        entityId: run.publicId,
        after: {
          date: dateStr,
          status: "completed",
          absentCount,
          presentCount,
          eventsEmitted,
          newlyMarkedAbsent: missing.length,
        },
      });

      return { ...run, date: dateStr, newlyMarkedAbsent: missing.length };
    },
    { timeoutMs: 60_000 },
  );

  return ok(result);
});
