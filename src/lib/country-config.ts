/**
 * Country configuration layer (§10).
 *
 * Abstracts Nepal-specific defaults behind a config object so adding
 * a new country = define a new CountryConfig, not a rewrite.
 *
 * Each country config defines: calendar system, grade scale defaults,
 * available payment providers, currency, fiscal rules, and locale.
 */

export type CalendarSystem = "bikram_sambat" | "gregorian";

export type CountryConfigDef = {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  currency: string; // ISO 4217
  currencySymbol: string;
  locale: string;
  timezone: string;
  calendarSystem: CalendarSystem;
  fiscalYearStartMonth: number; // 1-indexed (Jan=1, Shrawan=4 in BS context)
  defaultGradeScale: string; // key into grade_scales
  paymentProviders: string[];
  taxConfig: {
    vatRate: number; // percentage (e.g. 13 for Nepal)
    panRequired: boolean;
    cbmsRequired: boolean;
    cbmsThresholdPaisa: number | null; // null = not applicable
  };
  features: {
    bikramSambat: boolean;
    nepaliLanguage: boolean;
    rfidAttendance: boolean;
  };
};

/**
 * Nepal — the primary market. All defaults match current implementation.
 */
export const NEPAL: CountryConfigDef = {
  code: "NP",
  name: "Nepal",
  currency: "NPR",
  currencySymbol: "रू",
  locale: "ne",
  timezone: "Asia/Kathmandu",
  calendarSystem: "bikram_sambat",
  fiscalYearStartMonth: 4, // Shrawan
  defaultGradeScale: "neb_4.0",
  paymentProviders: ["esewa", "khalti", "connectips", "fonepay"],
  taxConfig: {
    vatRate: 13,
    panRequired: true,
    cbmsRequired: false, // only above threshold
    cbmsThresholdPaisa: 1_000_000_000, // ~NPR 10 crore in paisa
  },
  features: {
    bikramSambat: true,
    nepaliLanguage: true,
    rfidAttendance: true,
  },
};

/**
 * India — potential expansion market.
 */
export const INDIA: CountryConfigDef = {
  code: "IN",
  name: "India",
  currency: "INR",
  currencySymbol: "₹",
  locale: "en",
  timezone: "Asia/Kolkata",
  calendarSystem: "gregorian",
  fiscalYearStartMonth: 4, // April
  defaultGradeScale: "cbse_10",
  paymentProviders: ["razorpay", "paytm", "upi"],
  taxConfig: {
    vatRate: 18, // GST
    panRequired: true,
    cbmsRequired: false,
    cbmsThresholdPaisa: null,
  },
  features: {
    bikramSambat: false,
    nepaliLanguage: false,
    rfidAttendance: true,
  },
};

/**
 * Generic international — fallback for any non-configured country.
 */
export const INTERNATIONAL: CountryConfigDef = {
  code: "XX",
  name: "International",
  currency: "USD",
  currencySymbol: "$",
  locale: "en",
  timezone: "UTC",
  calendarSystem: "gregorian",
  fiscalYearStartMonth: 1, // January
  defaultGradeScale: "percentage",
  paymentProviders: ["stripe"],
  taxConfig: {
    vatRate: 0,
    panRequired: false,
    cbmsRequired: false,
    cbmsThresholdPaisa: null,
  },
  features: {
    bikramSambat: false,
    nepaliLanguage: false,
    rfidAttendance: true,
  },
};

/** Registry of all known country configs. */
const COUNTRY_REGISTRY: Record<string, CountryConfigDef> = {
  NP: NEPAL,
  IN: INDIA,
  XX: INTERNATIONAL,
};

/**
 * Get country config by ISO code. Falls back to INTERNATIONAL.
 */
export function getCountryConfig(code: string): CountryConfigDef {
  return COUNTRY_REGISTRY[code.toUpperCase()] ?? INTERNATIONAL;
}

/**
 * Get all available country configs.
 */
export function getAllCountryConfigs(): CountryConfigDef[] {
  return Object.values(COUNTRY_REGISTRY);
}

/**
 * Format a monetary amount using the country's currency.
 */
export function formatMoney(paisa: number, countryCode = "NP"): string {
  const config = getCountryConfig(countryCode);
  const amount = paisa / 100;
  return `${config.currencySymbol} ${amount.toLocaleString("en", { minimumFractionDigits: 0 })}`;
}

/**
 * Get the active country config for the platform.
 * Currently hardcoded to Nepal — will be configurable per-tenant later.
 */
export function getActiveCountryConfig(): CountryConfigDef {
  return NEPAL;
}
