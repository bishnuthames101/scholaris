import NepaliDate from "nepali-date-converter";

/**
 * Bikram Sambat (BS) ↔ Gregorian (AD) utilities (§3.6).
 * Canonical storage is always UTC/Gregorian; BS is a render/input format.
 */

export type BsDate = { year: number; month: number; day: number }; // month 1-12 (Baishakh=1)

const BS_MONTHS_EN = [
  "Baishakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
];
const BS_MONTHS_NE = [
  "बैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज",
  "कात्तिक", "मंसिर", "पुस", "माघ", "फागुन", "चैत",
];
const NE_DIGITS = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];

export function adToBs(date: Date): BsDate {
  const nd = new NepaliDate(date);
  return { year: nd.getYear(), month: nd.getMonth() + 1, day: nd.getDate() };
}

export function bsToAd(bs: BsDate): Date {
  return new NepaliDate(bs.year, bs.month - 1, bs.day).toJsDate();
}

export function toNepaliDigits(value: number | string): string {
  return String(value).replace(/\d/g, (d) => NE_DIGITS[Number(d)]);
}

/** e.g. "15 Shrawan 2082" (en) / "१५ साउन २०८२" (ne) */
export function formatBs(date: Date, locale: "en" | "ne" = "en"): string {
  const bs = adToBs(date);
  if (locale === "ne")
    return `${toNepaliDigits(bs.day)} ${BS_MONTHS_NE[bs.month - 1]} ${toNepaliDigits(bs.year)}`;
  return `${bs.day} ${BS_MONTHS_EN[bs.month - 1]} ${bs.year}`;
}

/** ISO-like BS string for compact display: "2082-04-15" */
export function formatBsIso(date: Date): string {
  const bs = adToBs(date);
  return `${bs.year}-${String(bs.month).padStart(2, "0")}-${String(bs.day).padStart(2, "0")}`;
}

export function bsMonthName(month: number, locale: "en" | "ne" = "en"): string {
  return (locale === "ne" ? BS_MONTHS_NE : BS_MONTHS_EN)[month - 1];
}

/**
 * Nepali fiscal year (Shrawan 1 → Ashadh end) label for a date,
 * e.g. "2082/83" — used for invoice numbering (§3.3).
 */
export function fiscalYearLabel(date: Date): string {
  const bs = adToBs(date);
  const startYear = bs.month >= 4 ? bs.year : bs.year - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}
