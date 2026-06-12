import { describe, expect, it } from "vitest";
import {
  NEB_DEFAULT_SCALE,
  bandForPercent,
  computeOverallResult,
  computeSubjectGrade,
  validateBands,
  type GradeBandInput,
  type SubjectMarksInput,
} from "../src/lib/exams/grading";

const bands = NEB_DEFAULT_SCALE.bands;

function subject(overrides: Partial<SubjectMarksInput>): SubjectMarksInput {
  return {
    marksTh: 50,
    marksPr: null,
    isAbsent: false,
    fullMarksTh: 100,
    passMarksTh: 35,
    fullMarksPr: null,
    passMarksPr: null,
    hasPractical: false,
    ...overrides,
  };
}

describe("grading — band lookup (NEB 4.0 default)", () => {
  it("maps band edges correctly", () => {
    expect(bandForPercent(100, bands).letter).toBe("A+");
    expect(bandForPercent(90, bands).letter).toBe("A+");
    expect(bandForPercent(89.99, bands).letter).toBe("A");
    expect(bandForPercent(80, bands).letter).toBe("A");
    expect(bandForPercent(70, bands).letter).toBe("B+");
    expect(bandForPercent(60, bands).letter).toBe("B");
    expect(bandForPercent(50, bands).letter).toBe("C+");
    expect(bandForPercent(40, bands).letter).toBe("C");
    expect(bandForPercent(35, bands).letter).toBe("D+");
    expect(bandForPercent(34.99, bands).letter).toBe("NG");
    expect(bandForPercent(0, bands).letter).toBe("NG");
  });

  it("assigns grade points per NEB", () => {
    expect(bandForPercent(95, bands).gradePoint).toBe(4.0);
    expect(bandForPercent(85, bands).gradePoint).toBe(3.6);
    expect(bandForPercent(37, bands).gradePoint).toBe(1.6);
    expect(bandForPercent(10, bands).gradePoint).toBe(0.0);
  });
});

describe("grading — subject grade computation", () => {
  it("grades theory-only subjects", () => {
    const g = computeSubjectGrade(subject({ marksTh: 92 }), bands);
    expect(g).toMatchObject({ letter: "A+", gradePoint: 4.0, percent: 92, isNg: false });
  });

  it("combines theory + practical into the percent", () => {
    // 60/75 theory + 20/25 practical = 80/100 = 80% → A
    const g = computeSubjectGrade(
      subject({
        marksTh: 60,
        marksPr: 20,
        fullMarksTh: 75,
        passMarksTh: 27,
        fullMarksPr: 25,
        passMarksPr: 10,
        hasPractical: true,
      }),
      bands,
    );
    expect(g.percent).toBe(80);
    expect(g.letter).toBe("A");
    expect(g.fullMarks).toBe(100);
    expect(g.obtained).toBe(80);
  });

  it("gives NG when theory is below pass marks even if combined percent passes", () => {
    // Theory 20/75 (pass 27 → fail), practical 25/25 → combined 45% would be C
    const g = computeSubjectGrade(
      subject({
        marksTh: 20,
        marksPr: 25,
        fullMarksTh: 75,
        passMarksTh: 27,
        fullMarksPr: 25,
        passMarksPr: 10,
        hasPractical: true,
      }),
      bands,
    );
    expect(g.letter).toBe("NG");
    expect(g.gradePoint).toBe(0);
    expect(g.isNg).toBe(true);
  });

  it("gives NG when practical is below pass marks", () => {
    const g = computeSubjectGrade(
      subject({
        marksTh: 70,
        marksPr: 4,
        fullMarksTh: 75,
        passMarksTh: 27,
        fullMarksPr: 25,
        passMarksPr: 10,
        hasPractical: true,
      }),
      bands,
    );
    expect(g.isNg).toBe(true);
  });

  it("gives NG for absent students regardless of marks", () => {
    const g = computeSubjectGrade(subject({ marksTh: 95, isAbsent: true }), bands);
    expect(g.letter).toBe("NG");
  });

  it("gives NG when a required component is missing", () => {
    expect(computeSubjectGrade(subject({ marksTh: null }), bands).isNg).toBe(true);
    expect(
      computeSubjectGrade(
        subject({
          marksTh: 70,
          marksPr: null,
          fullMarksTh: 75,
          fullMarksPr: 25,
          passMarksPr: 10,
          hasPractical: true,
        }),
        bands,
      ).isNg,
    ).toBe(true);
  });

  it("exactly at pass marks is a pass", () => {
    const g = computeSubjectGrade(subject({ marksTh: 35 }), bands);
    expect(g.letter).toBe("D+");
    expect(g.isNg).toBe(false);
  });

  it("reflows when a different scale is used", () => {
    // Custom scale where pass band starts at 50%.
    const custom: GradeBandInput[] = [
      { letter: "P", gradePoint: 4, minPercent: 50, maxPercent: 100, isPassing: true },
      { letter: "F", gradePoint: 0, minPercent: 0, maxPercent: 50, isPassing: false },
    ];
    expect(computeSubjectGrade(subject({ marksTh: 45 }), bands).letter).toBe("C");
    expect(computeSubjectGrade(subject({ marksTh: 45 }), custom).letter).toBe("F");
  });
});

describe("grading — overall result (GPA + NG handling)", () => {
  it("averages subject grade points to 2dp", () => {
    const grades = [
      computeSubjectGrade(subject({ marksTh: 95 }), bands), // 4.0
      computeSubjectGrade(subject({ marksTh: 85 }), bands), // 3.6
      computeSubjectGrade(subject({ marksTh: 75 }), bands), // 3.2
    ];
    const overall = computeOverallResult(grades);
    expect(overall.gpa).toBe(3.6);
    expect(overall.status).toBe("passed");
    expect(overall.ngCount).toBe(0);
  });

  it("any NG subject means failed", () => {
    const grades = [
      computeSubjectGrade(subject({ marksTh: 95 }), bands),
      computeSubjectGrade(subject({ marksTh: 10 }), bands), // NG
    ];
    const overall = computeOverallResult(grades);
    expect(overall.status).toBe("failed");
    expect(overall.ngCount).toBe(1);
    expect(overall.gpa).toBe(2); // (4.0 + 0) / 2
  });

  it("empty subject list is failed with 0 GPA", () => {
    expect(computeOverallResult([])).toEqual({ gpa: 0, ngCount: 0, status: "failed" });
  });
});

describe("grading — band table validation", () => {
  it("accepts the NEB default", () => {
    expect(validateBands(bands)).toBeNull();
  });

  it("rejects gaps, overlaps, and bad coverage", () => {
    expect(
      validateBands([
        { letter: "A", gradePoint: 4, minPercent: 50, maxPercent: 100, isPassing: true },
        { letter: "F", gradePoint: 0, minPercent: 0, maxPercent: 40, isPassing: false },
      ]),
    ).toMatch(/Gap or overlap/);
    expect(
      validateBands([
        { letter: "A", gradePoint: 4, minPercent: 10, maxPercent: 100, isPassing: true },
        { letter: "F", gradePoint: 0, minPercent: 10, maxPercent: 10, isPassing: false },
      ]),
    ).not.toBeNull();
    expect(
      validateBands([
        { letter: "A", gradePoint: 4, minPercent: 50, maxPercent: 90, isPassing: true },
        { letter: "F", gradePoint: 0, minPercent: 0, maxPercent: 50, isPassing: false },
      ]),
    ).toMatch(/end at 100/);
  });

  it("requires exactly one NG band and unique letters", () => {
    expect(
      validateBands([
        { letter: "A", gradePoint: 4, minPercent: 50, maxPercent: 100, isPassing: true },
        { letter: "B", gradePoint: 2, minPercent: 0, maxPercent: 50, isPassing: true },
      ]),
    ).toMatch(/non-passing/);
    expect(
      validateBands([
        { letter: "A", gradePoint: 4, minPercent: 50, maxPercent: 100, isPassing: true },
        { letter: "A", gradePoint: 0, minPercent: 0, maxPercent: 50, isPassing: false },
      ]),
    ).toMatch(/unique/);
  });
});
