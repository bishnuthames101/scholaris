import { ApiError } from "./api";

/**
 * Attendance domain helpers (Phase 2, §7.6).
 *
 * "Today" for attendance is always Asia/Kathmandu (UTC+05:45, no DST).
 * Dates are stored as `@db.Date` columns: a UTC midnight DateTime whose
 * Y-M-D is the Kathmandu calendar date.
 */

export const KATHMANDU_OFFSET_MIN = 5 * 60 + 45;

/** Kathmandu calendar date ("YYYY-MM-DD") of an instant. */
export function kathmanduDateString(d: Date = new Date()): string {
  const shifted = new Date(d.getTime() + KATHMANDU_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** Kathmandu wall-clock minutes since midnight of an instant. */
export function kathmanduMinutesOfDay(d: Date = new Date()): number {
  const shifted = new Date(d.getTime() + KATHMANDU_OFFSET_MIN * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a "YYYY-MM-DD" string into the UTC-midnight Date used for `@db.Date` columns. */
export function toDbDate(dateStr: string): Date {
  if (!DATE_RE.test(dateStr))
    throw new ApiError("INVALID_DATE", "Date must be YYYY-MM-DD", 400);
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dateStr)
    throw new ApiError("INVALID_DATE", "Invalid calendar date", 400);
  return d;
}

/** Format a `@db.Date` value back to "YYYY-MM-DD". */
export function fromDbDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────
// Per-school attendance settings (stored in tenants.settings JSON —
// editable at runtime, no redeploy; §7.6)
// ─────────────────────────────────────────────────────────────

export type MessagingMode = "off" | "absence_only" | "per_tap";

export type AttendanceSettings = {
  messagingMode: MessagingMode;
  /** Kathmandu wall-clock "HH:MM" after which the absence job may run. */
  absenceCutoff: string;
};

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  messagingMode: "absence_only",
  absenceCutoff: "10:00",
};

const CUTOFF_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidCutoff(v: string): boolean {
  return CUTOFF_RE.test(v);
}

export function cutoffToMinutes(cutoff: string): number {
  const [h, m] = cutoff.split(":").map(Number);
  return h * 60 + m;
}

/** Read attendance settings out of a tenant `settings` JSON blob (with defaults). */
export function attendanceSettingsOf(settings: unknown): AttendanceSettings {
  const raw =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>).attendance
      : undefined;
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mode = a.messagingMode;
  const cutoff = a.absenceCutoff;
  return {
    messagingMode:
      mode === "off" || mode === "absence_only" || mode === "per_tap"
        ? mode
        : DEFAULT_ATTENDANCE_SETTINGS.messagingMode,
    absenceCutoff:
      typeof cutoff === "string" && isValidCutoff(cutoff)
        ? cutoff
        : DEFAULT_ATTENDANCE_SETTINGS.absenceCutoff,
  };
}

// ─────────────────────────────────────────────────────────────
// Absence-run planning (the offline-vs-absent guard, §7.6) —
// pure so it is unit-testable.
// ─────────────────────────────────────────────────────────────

export type AbsencePlanInput = {
  messagingMode: MessagingMode;
  /** Did any active device submit >=1 swipe for the run date? */
  anyDeviceReportedToday: boolean;
  /** Are there any manual/rfid attendance records for the run date? */
  anyRecordsToday: boolean;
};

export type AbsencePlan =
  | { action: "skip"; reason: "messaging_off" }
  | { action: "hold"; reason: "no_data_reported" }
  | { action: "run" };

/**
 * Decide what the daily absence job should do.
 * - messaging off → skip entirely.
 * - no attendance data at all (no device reported AND no records) → HOLD:
 *   we cannot distinguish "everyone absent" from "reader offline all day",
 *   so we must not message anyone — flag for manual review instead.
 * - otherwise → run (absence is computed per covered section only).
 */
export function planAbsenceRun(input: AbsencePlanInput): AbsencePlan {
  if (input.messagingMode === "off") return { action: "skip", reason: "messaging_off" };
  if (!input.anyDeviceReportedToday && !input.anyRecordsToday)
    return { action: "hold", reason: "no_data_reported" };
  return { action: "run" };
}
