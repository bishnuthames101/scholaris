/**
 * NEB grading computation (§3.2) — pure functions, unit-testable.
 *
 * Rules implemented:
 *  - Numeric marks per subject (theory + optional practical).
 *  - Percent = obtained / full × 100 across both components.
 *  - Letter + grade point come from a configurable band table
 *    (NEB 4.0 shipped as the default).
 *  - NG ("not graded") when a student fails EITHER component
 *    (below pass marks in theory or practical) or is absent —
 *    regardless of the combined percentage.
 *  - Overall GPA = mean of subject grade points; any NG ⇒ result "failed".
 */

export type GradeBandInput = {
  letter: string;
  gradePoint: number;
  minPercent: number; // inclusive
  maxPercent: number; // inclusive at the top band
  isPassing: boolean;
};

export type SubjectMarksInput = {
  marksTh: number | null;
  marksPr: number | null;
  isAbsent: boolean;
  fullMarksTh: number;
  passMarksTh: number;
  fullMarksPr: number | null;
  passMarksPr: number | null;
  hasPractical: boolean;
};

export type SubjectGrade = {
  obtained: number;
  fullMarks: number;
  percent: number; // rounded to 2dp
  letter: string;
  gradePoint: number;
  isNg: boolean;
};

/** NEB 4.0 default scale (configurable per tenant; plan §3.2). */
export const NEB_DEFAULT_SCALE: { name: string; bands: GradeBandInput[] } = {
  name: "NEB 4.0",
  bands: [
    { letter: "A+", gradePoint: 4.0, minPercent: 90, maxPercent: 100, isPassing: true },
    { letter: "A", gradePoint: 3.6, minPercent: 80, maxPercent: 90, isPassing: true },
    { letter: "B+", gradePoint: 3.2, minPercent: 70, maxPercent: 80, isPassing: true },
    { letter: "B", gradePoint: 2.8, minPercent: 60, maxPercent: 70, isPassing: true },
    { letter: "C+", gradePoint: 2.4, minPercent: 50, maxPercent: 60, isPassing: true },
    { letter: "C", gradePoint: 2.0, minPercent: 40, maxPercent: 50, isPassing: true },
    { letter: "D+", gradePoint: 1.6, minPercent: 35, maxPercent: 40, isPassing: true },
    { letter: "NG", gradePoint: 0.0, minPercent: 0, maxPercent: 35, isPassing: false },
  ],
};

export const NG_LETTER = "NG";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Find the band for a percentage. Bands are [min, max) except the top band,
 * which includes its max (so 100% lands in A+, 90% in A+, 89.99% in A).
 */
export function bandForPercent(percent: number, bands: GradeBandInput[]): GradeBandInput {
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  const top = sorted[0];
  if (percent >= top.minPercent) return top;
  for (const b of sorted) {
    if (percent >= b.minPercent && percent < b.maxPercent) return b;
  }
  // Below every band (shouldn't happen with a 0-floor NG band) → lowest band.
  return sorted[sorted.length - 1];
}

/** The fail band of a scale (isPassing=false), used for NG assignment. */
export function ngBand(bands: GradeBandInput[]): GradeBandInput {
  return (
    bands.find((b) => !b.isPassing) ?? {
      letter: NG_LETTER,
      gradePoint: 0,
      minPercent: 0,
      maxPercent: 0,
      isPassing: false,
    }
  );
}

/**
 * Compute one subject's grade.
 * NG when: absent, missing a required component, or below pass marks in
 * either theory or practical — even if the combined percent is passing.
 */
export function computeSubjectGrade(
  input: SubjectMarksInput,
  bands: GradeBandInput[],
): SubjectGrade {
  const fullPr = input.hasPractical ? (input.fullMarksPr ?? 0) : 0;
  const fullMarks = input.fullMarksTh + fullPr;
  const th = input.marksTh ?? 0;
  const pr = input.hasPractical ? (input.marksPr ?? 0) : 0;
  const obtained = th + pr;
  const percent = fullMarks > 0 ? round2((obtained / fullMarks) * 100) : 0;

  const failTheory = input.marksTh === null || th < input.passMarksTh;
  const failPractical =
    input.hasPractical &&
    (input.marksPr === null || pr < (input.passMarksPr ?? 0));

  if (input.isAbsent || failTheory || failPractical) {
    const ng = ngBand(bands);
    return { obtained, fullMarks, percent, letter: ng.letter, gradePoint: ng.gradePoint, isNg: true };
  }

  const band = bandForPercent(percent, bands);
  return {
    obtained,
    fullMarks,
    percent,
    letter: band.letter,
    gradePoint: band.gradePoint,
    isNg: !band.isPassing,
  };
}

export type OverallResult = {
  gpa: number; // mean of subject grade points, 2dp
  ngCount: number;
  status: "passed" | "failed";
};

/** Overall GPA + pass/fail across a student's subjects. */
export function computeOverallResult(subjects: SubjectGrade[]): OverallResult {
  if (subjects.length === 0) return { gpa: 0, ngCount: 0, status: "failed" };
  const ngCount = subjects.filter((s) => s.isNg).length;
  const gpa = round2(subjects.reduce((sum, s) => sum + s.gradePoint, 0) / subjects.length);
  return { gpa, ngCount, status: ngCount > 0 ? "failed" : "passed" };
}

/** Validate a band table: full 0–100 coverage, no overlaps, exactly one fail band. */
export function validateBands(bands: GradeBandInput[]): string | null {
  if (bands.length < 2) return "At least two grade bands are required";
  const sorted = [...bands].sort((a, b) => a.minPercent - b.minPercent);
  if (sorted[0].minPercent !== 0) return "Bands must start at 0%";
  if (sorted[sorted.length - 1].maxPercent !== 100) return "Bands must end at 100%";
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (b.minPercent >= b.maxPercent) return `Band ${b.letter}: min must be below max`;
    if (i > 0 && sorted[i - 1].maxPercent !== b.minPercent)
      return `Gap or overlap between ${sorted[i - 1].letter} and ${b.letter}`;
  }
  const failBands = bands.filter((b) => !b.isPassing);
  if (failBands.length !== 1) return "Exactly one non-passing (NG) band is required";
  const letters = new Set(bands.map((b) => b.letter));
  if (letters.size !== bands.length) return "Band letters must be unique";
  return null;
}
