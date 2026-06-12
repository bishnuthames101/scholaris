import { toNepaliDigits } from "@/lib/dates/bs";

/**
 * Money utilities — ALL monetary math is integer paisa (1 NPR = 100 paisa).
 * Floats never enter storage or arithmetic; they exist only at the UI edge.
 */

export function isValidPaisa(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** "1234.50" | "1234" | 1234.5 → 123450 paisa. Throws on bad input. */
export function nprToPaisa(input: string | number): number {
  const s = String(input).trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    throw new Error(`Invalid NPR amount: ${String(input)}`);
  }
  const [whole, frac = ""] = s.split(".");
  const paisa = Number(whole) * 100 + Number(frac.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(paisa)) throw new Error("Amount out of range");
  return paisa;
}

/** 123450 → "1234.50"; whole rupees drop the decimals ("1200"). */
export function paisaToNpr(paisa: number): string {
  const whole = Math.trunc(paisa / 100);
  const frac = Math.abs(paisa % 100);
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0")}`;
}

/** Display format with separators: "Rs. 12,345.50" / "रु १२,३४५.५०". */
export function formatNpr(paisa: number, locale: "en" | "ne" = "en"): string {
  const sign = paisa < 0 ? "-" : "";
  const abs = Math.abs(paisa);
  const whole = Math.trunc(abs / 100).toLocaleString("en-IN");
  const frac = abs % 100;
  const num = frac === 0 ? whole : `${whole}.${String(frac).padStart(2, "0")}`;
  if (locale === "ne") return `${sign}रु ${toNepaliDigits(num)}`;
  return `${sign}Rs. ${num}`;
}

export type DiscountSpec = { type: "percent" | "fixed"; value: number };

/**
 * Discount on a single charge. Percent rounds half-up to the nearest paisa;
 * the result is clamped so a discount can never exceed the charge.
 */
export function discountAmount(amountPaisa: number, spec: DiscountSpec): number {
  const raw =
    spec.type === "percent" ? Math.round((amountPaisa * spec.value) / 100) : spec.value;
  return Math.max(0, Math.min(raw, amountPaisa));
}
