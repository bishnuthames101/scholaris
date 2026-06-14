export type LibrarySettings = {
  maxIssueDays: number;
  maxBooksStudent: number;
  maxBooksStaff: number;
  finePerDayPaisa: number;
};

export function librarySettingsOf(settings: unknown): LibrarySettings {
  const s = (settings && typeof settings === "object" ? settings : {}) as Record<string, unknown>;
  const lib = (s.library && typeof s.library === "object" ? s.library : {}) as Record<string, unknown>;
  return {
    maxIssueDays: typeof lib.maxIssueDays === "number" ? lib.maxIssueDays : 14,
    maxBooksStudent: typeof lib.maxBooksStudent === "number" ? lib.maxBooksStudent : 3,
    maxBooksStaff: typeof lib.maxBooksStaff === "number" ? lib.maxBooksStaff : 5,
    finePerDayPaisa: typeof lib.finePerDayPaisa === "number" ? lib.finePerDayPaisa : 500,
  };
}
