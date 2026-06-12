import { describe, expect, it } from "vitest";
import {
  discountAmount,
  formatNpr,
  isValidPaisa,
  nprToPaisa,
  paisaToNpr,
} from "../src/lib/fees/money";
import { formatInvoiceNo, formatReceiptNo } from "../src/lib/fees/numbering";
import { fiscalYearLabel } from "../src/lib/dates/bs";
import { amountInWords, scriptRuns } from "../src/lib/fees/receipt-pdf";

describe("money — integer-paisa math", () => {
  it("parses NPR strings into paisa", () => {
    expect(nprToPaisa("1234.50")).toBe(123450);
    expect(nprToPaisa("1234")).toBe(123400);
    expect(nprToPaisa("0.05")).toBe(5);
    expect(nprToPaisa("1,234.5")).toBe(123450);
  });

  it("rejects malformed amounts", () => {
    expect(() => nprToPaisa("12.345")).toThrow();
    expect(() => nprToPaisa("-5")).toThrow();
    expect(() => nprToPaisa("abc")).toThrow();
    expect(() => nprToPaisa("")).toThrow();
  });

  it("round-trips paisa ↔ NPR", () => {
    expect(paisaToNpr(123450)).toBe("1234.50");
    expect(paisaToNpr(120000)).toBe("1200");
    expect(nprToPaisa(paisaToNpr(987654321))).toBe(987654321);
  });

  it("formats bilingual display amounts", () => {
    expect(formatNpr(1234550, "en")).toBe("Rs. 12,345.50");
    expect(formatNpr(-5000, "en")).toBe("-Rs. 50");
    expect(formatNpr(1234550, "ne")).toContain("रु");
  });

  it("validates paisa values", () => {
    expect(isValidPaisa(0)).toBe(true);
    expect(isValidPaisa(100)).toBe(true);
    expect(isValidPaisa(-1)).toBe(false);
    expect(isValidPaisa(1.5)).toBe(false);
    expect(isValidPaisa("100")).toBe(false);
  });

  it("computes clamped discounts", () => {
    expect(discountAmount(10000, { type: "percent", value: 25 })).toBe(2500);
    expect(discountAmount(10000, { type: "fixed", value: 3000 })).toBe(3000);
    // never exceeds the charge
    expect(discountAmount(10000, { type: "fixed", value: 99999 })).toBe(10000);
    expect(discountAmount(10000, { type: "percent", value: 150 })).toBe(10000);
    // half-up rounding to the nearest paisa
    expect(discountAmount(101, { type: "percent", value: 50 })).toBe(51);
  });
});

describe("fiscal-year document numbering (IRD)", () => {
  it("derives the BS fiscal year (starts Shrawan, month 4)", () => {
    // 2026-06-12 AD = Jestha 2083 BS (month 2) → fiscal 2082/83.
    expect(fiscalYearLabel(new Date("2026-06-12T00:00:00Z"))).toBe("2082/83");
    // 2026-08-15 AD = Shrawan/Bhadra 2083 (month ≥ 4) → fiscal 2083/84.
    expect(fiscalYearLabel(new Date("2026-08-15T00:00:00Z"))).toBe("2083/84");
  });

  it("formats invoice and receipt numbers per fiscal year", () => {
    expect(formatInvoiceNo("2082/83", 7)).toBe("2082/83-INV-000007");
    expect(formatReceiptNo("2082/83", 123456)).toBe("2082/83-RCP-123456");
  });
});

describe("receipt PDF helpers", () => {
  it("spells amounts in Nepali-style words (lakh/crore)", () => {
    expect(amountInWords(1234550)).toBe(
      "twelve thousand three hundred forty-five rupees and fifty paisa only",
    );
    expect(amountInWords(150_000_00)).toBe("one lakh fifty thousand rupees only");
    expect(amountInWords(2_50_00_000_00)).toBe("two crore fifty lakh rupees only");
    expect(amountInWords(0)).toBe("zero rupees only");
  });

  it("splits mixed Devanagari/Latin text into script runs", () => {
    const runs = scriptRuns("Cash / नगद");
    expect(runs.map((r) => r.deva)).toEqual([false, true]);
    expect(runs.map((r) => r.text).join("")).toBe("Cash / नगद");
    expect(scriptRuns("only latin")).toEqual([{ text: "only latin", deva: false }]);
  });
});
