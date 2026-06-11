import { describe, expect, it } from "vitest";
import {
  attendanceSettingsOf,
  cutoffToMinutes,
  fromDbDate,
  isValidCutoff,
  kathmanduDateString,
  kathmanduMinutesOfDay,
  planAbsenceRun,
  toDbDate,
} from "../src/lib/attendance";
import { generateDeviceSecret, hmacSign, hmacVerify } from "../src/lib/rfid-auth";

describe("Kathmandu date helpers", () => {
  it("shifts UTC instants into the Kathmandu calendar day (+05:45)", () => {
    // 18:14 UTC is 23:59 in Kathmandu (same day); 18:15 UTC is 00:00 next day.
    expect(kathmanduDateString(new Date("2026-06-11T18:14:59Z"))).toBe("2026-06-11");
    expect(kathmanduDateString(new Date("2026-06-11T18:15:00Z"))).toBe("2026-06-12");
    // 03:00 UTC = 08:45 Kathmandu same day.
    expect(kathmanduDateString(new Date("2026-06-11T03:00:00Z"))).toBe("2026-06-11");
  });

  it("computes Kathmandu wall-clock minutes", () => {
    // 04:15 UTC = 10:00 Kathmandu.
    expect(kathmanduMinutesOfDay(new Date("2026-06-11T04:15:00Z"))).toBe(600);
  });

  it("round-trips db dates and rejects bad input", () => {
    const d = toDbDate("2026-06-11");
    expect(d.toISOString()).toBe("2026-06-11T00:00:00.000Z");
    expect(fromDbDate(d)).toBe("2026-06-11");
    expect(() => toDbDate("2026-13-40")).toThrow();
    expect(() => toDbDate("11/06/2026")).toThrow();
  });
});

describe("attendance settings", () => {
  it("falls back to defaults", () => {
    expect(attendanceSettingsOf(null)).toEqual({
      messagingMode: "absence_only",
      absenceCutoff: "10:00",
    });
    expect(attendanceSettingsOf({ attendance: { messagingMode: "bogus" } }).messagingMode).toBe(
      "absence_only",
    );
  });

  it("reads stored values", () => {
    expect(
      attendanceSettingsOf({ attendance: { messagingMode: "per_tap", absenceCutoff: "11:30" } }),
    ).toEqual({ messagingMode: "per_tap", absenceCutoff: "11:30" });
  });

  it("validates cutoff strings", () => {
    expect(isValidCutoff("10:00")).toBe(true);
    expect(isValidCutoff("23:59")).toBe(true);
    expect(isValidCutoff("24:00")).toBe(false);
    expect(isValidCutoff("9:00")).toBe(false);
    expect(cutoffToMinutes("10:30")).toBe(630);
  });
});

describe("absence-run guard (offline-vs-absent)", () => {
  it("skips when messaging is off", () => {
    expect(
      planAbsenceRun({
        messagingMode: "off",
        anyDeviceReportedToday: true,
        anyRecordsToday: true,
      }),
    ).toEqual({ action: "skip", reason: "messaging_off" });
  });

  it("HOLDS when no device reported and nothing was marked (reader offline all day)", () => {
    expect(
      planAbsenceRun({
        messagingMode: "absence_only",
        anyDeviceReportedToday: false,
        anyRecordsToday: false,
      }),
    ).toEqual({ action: "hold", reason: "no_data_reported" });
  });

  it("runs when a device reported swipes", () => {
    expect(
      planAbsenceRun({
        messagingMode: "absence_only",
        anyDeviceReportedToday: true,
        anyRecordsToday: false,
      }),
    ).toEqual({ action: "run" });
  });

  it("runs on manual records even with silent devices", () => {
    expect(
      planAbsenceRun({
        messagingMode: "per_tap",
        anyDeviceReportedToday: false,
        anyRecordsToday: true,
      }),
    ).toEqual({ action: "run" });
  });
});

describe("device HMAC", () => {
  it("signs and verifies", () => {
    const secret = generateDeviceSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    const body = JSON.stringify({ swipes: [{ uid: "04A1B2", ts: "2026-06-11T03:00:00Z" }] });
    const sig = hmacSign(secret, body);
    expect(hmacVerify(secret, body, sig)).toBe(true);
    expect(hmacVerify(secret, body + " ", sig)).toBe(false);
    expect(hmacVerify(generateDeviceSecret(), body, sig)).toBe(false);
    expect(hmacVerify(secret, body, "zz-not-hex")).toBe(false);
    expect(hmacVerify(secret, body, sig.slice(0, 32))).toBe(false);
  });
});
