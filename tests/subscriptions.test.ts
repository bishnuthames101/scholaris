import { describe, it, expect } from "vitest";
import {
  getCountryConfig,
  getAllCountryConfigs,
  formatMoney,
  getActiveCountryConfig,
  NEPAL,
  INDIA,
  INTERNATIONAL,
} from "../src/lib/country-config";
import {
  ALL_MODULES,
  MODULE_LABELS,
  type ModuleKey,
} from "../src/lib/subscriptions";

// ─────────────────────────────────────────────────────────────
// Country config
// ─────────────────────────────────────────────────────────────

describe("getCountryConfig", () => {
  it("returns Nepal config for 'NP'", () => {
    const cfg = getCountryConfig("NP");
    expect(cfg.code).toBe("NP");
    expect(cfg.currency).toBe("NPR");
    expect(cfg.currencySymbol).toBe("रू");
    expect(cfg.calendarSystem).toBe("bikram_sambat");
    expect(cfg.timezone).toBe("Asia/Kathmandu");
    expect(cfg.defaultGradeScale).toBe("neb_4.0");
    expect(cfg.paymentProviders).toContain("esewa");
    expect(cfg.paymentProviders).toContain("khalti");
    expect(cfg.taxConfig.vatRate).toBe(13);
    expect(cfg.taxConfig.panRequired).toBe(true);
    expect(cfg.features.bikramSambat).toBe(true);
    expect(cfg.features.nepaliLanguage).toBe(true);
  });

  it("returns India config for 'IN'", () => {
    const cfg = getCountryConfig("IN");
    expect(cfg.code).toBe("IN");
    expect(cfg.currency).toBe("INR");
    expect(cfg.calendarSystem).toBe("gregorian");
    expect(cfg.defaultGradeScale).toBe("cbse_10");
    expect(cfg.features.bikramSambat).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(getCountryConfig("np").code).toBe("NP");
    expect(getCountryConfig("in").code).toBe("IN");
  });

  it("falls back to INTERNATIONAL for unknown country", () => {
    const cfg = getCountryConfig("ZZ");
    expect(cfg.code).toBe("XX");
    expect(cfg.currency).toBe("USD");
    expect(cfg.calendarSystem).toBe("gregorian");
  });

  it("falls back for empty string", () => {
    expect(getCountryConfig("").code).toBe("XX");
  });
});

describe("getAllCountryConfigs", () => {
  it("returns at least NP, IN, XX", () => {
    const all = getAllCountryConfigs();
    const codes = all.map((c) => c.code);
    expect(codes).toContain("NP");
    expect(codes).toContain("IN");
    expect(codes).toContain("XX");
  });
});

describe("formatMoney", () => {
  it("formats NPR correctly", () => {
    const result = formatMoney(150000, "NP");
    expect(result).toContain("रू");
    expect(result).toContain("1,500");
  });

  it("formats INR correctly", () => {
    const result = formatMoney(250000, "IN");
    expect(result).toContain("₹");
    expect(result).toContain("2,500");
  });

  it("formats USD for unknown country", () => {
    const result = formatMoney(99900, "ZZ");
    expect(result).toContain("$");
    expect(result).toContain("999");
  });

  it("handles zero", () => {
    const result = formatMoney(0, "NP");
    expect(result).toContain("0");
  });

  it("defaults to NP when no country specified", () => {
    const result = formatMoney(100);
    expect(result).toContain("रू");
  });
});

describe("getActiveCountryConfig", () => {
  it("returns Nepal as the active config", () => {
    const cfg = getActiveCountryConfig();
    expect(cfg).toBe(NEPAL);
    expect(cfg.code).toBe("NP");
  });
});

describe("country config consistency", () => {
  it("Nepal config has all required fields", () => {
    expect(NEPAL.fiscalYearStartMonth).toBe(4);
    expect(NEPAL.locale).toBe("ne");
    expect(NEPAL.taxConfig.cbmsThresholdPaisa).toBeTypeOf("number");
  });

  it("India config has all required fields", () => {
    expect(INDIA.fiscalYearStartMonth).toBe(4);
    expect(INDIA.locale).toBe("en");
    expect(INDIA.taxConfig.vatRate).toBe(18);
  });

  it("International config has sane defaults", () => {
    expect(INTERNATIONAL.fiscalYearStartMonth).toBe(1);
    expect(INTERNATIONAL.taxConfig.vatRate).toBe(0);
    expect(INTERNATIONAL.paymentProviders).toContain("stripe");
  });
});

// ─────────────────────────────────────────────────────────────
// Module registry
// ─────────────────────────────────────────────────────────────

describe("ALL_MODULES", () => {
  it("contains core modules", () => {
    expect(ALL_MODULES).toContain("sis");
    expect(ALL_MODULES).toContain("attendance");
    expect(ALL_MODULES).toContain("fees");
    expect(ALL_MODULES).toContain("exams");
    expect(ALL_MODULES).toContain("communication");
    expect(ALL_MODULES).toContain("notices");
  });

  it("contains secondary modules", () => {
    expect(ALL_MODULES).toContain("timetable");
    expect(ALL_MODULES).toContain("homework");
    expect(ALL_MODULES).toContain("library");
    expect(ALL_MODULES).toContain("transport");
    expect(ALL_MODULES).toContain("hr");
    expect(ALL_MODULES).toContain("admissions");
  });

  it("has a label for every module", () => {
    for (const mod of ALL_MODULES) {
      expect(MODULE_LABELS[mod as ModuleKey]).toBeTruthy();
    }
  });

  it("has 12 total modules", () => {
    expect(ALL_MODULES).toHaveLength(12);
  });
});
