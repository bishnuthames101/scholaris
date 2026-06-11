import { describe, it, expect } from "vitest";
import {
  adToBs,
  bsToAd,
  formatBs,
  formatBsIso,
  fiscalYearLabel,
  toNepaliDigits,
} from "../src/lib/dates/bs";

describe("BS ↔ AD conversion", () => {
  it("converts a known AD date to BS (2024-04-13 → 2081-01-01)", () => {
    const bs = adToBs(new Date(2024, 3, 13)); // 13 Apr 2024 = 1 Baishakh 2081
    expect(bs).toEqual({ year: 2081, month: 1, day: 1 });
  });

  it("round-trips BS → AD → BS", () => {
    const bs = { year: 2082, month: 4, day: 15 };
    const ad = bsToAd(bs);
    expect(adToBs(ad)).toEqual(bs);
  });

  it("formats BS in English and Nepali", () => {
    const d = bsToAd({ year: 2082, month: 4, day: 15 });
    expect(formatBs(d, "en")).toBe("15 Shrawan 2082");
    expect(formatBs(d, "ne")).toBe("१५ साउन २०८२");
  });

  it("formats compact ISO-like BS", () => {
    const d = bsToAd({ year: 2082, month: 4, day: 5 });
    expect(formatBsIso(d)).toBe("2082-04-05");
  });

  it("converts digits to Devanagari", () => {
    expect(toNepaliDigits(2082)).toBe("२०८२");
  });

  it("computes Nepali fiscal year (Shrawan boundary)", () => {
    // Shrawan 2082 → FY 2082/83
    expect(fiscalYearLabel(bsToAd({ year: 2082, month: 4, day: 1 }))).toBe("2082/83");
    // Ashadh 2082 (month 3, before Shrawan) → FY 2081/82
    expect(fiscalYearLabel(bsToAd({ year: 2082, month: 3, day: 30 }))).toBe("2081/82");
  });
});
