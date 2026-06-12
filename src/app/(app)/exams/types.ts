export type ExamType = "unit" | "terminal" | "board";
export type ExamStatus = "draft" | "published";

/** Prisma Decimal serializes to a string in JSON. */
export type DecimalLike = string | number;

export type BandRow = {
  letter: string;
  letterNe: string | null;
  gradePoint: DecimalLike;
  minPercent: DecimalLike;
  maxPercent: DecimalLike;
  isPassing: boolean;
  sortOrder: number;
};

export type GradeScaleRow = {
  publicId: string;
  name: string;
  isDefault: boolean;
  bands: BandRow[];
  _count?: { exams: number };
};

export type ExamListRow = {
  publicId: string;
  name: string;
  nameNe: string | null;
  type: ExamType;
  status: ExamStatus;
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  academicYear: { publicId: string; name: string };
  gradeScale: { publicId: string; name: string };
  _count: { subjects: number; marks: number; results: number };
};

export type ExamSubjectRow = {
  publicId: string;
  hasPractical: boolean;
  fullMarksTh: number;
  passMarksTh: number;
  fullMarksPr: number | null;
  passMarksPr: number | null;
  examDate: string | null;
  class: { publicId: string; name: string; nameNe?: string | null; gradeLevel: number };
  subject: { publicId: string; name: string; nameNe: string | null; code: string | null };
  _count: { marks: number };
};

export type ExamDetail = Omit<ExamListRow, "gradeScale" | "_count"> & {
  gradeScale: { publicId: string; name: string; bands: BandRow[] };
  subjects: ExamSubjectRow[];
  _count: { results: number };
};

export type RosterRow = {
  student: { publicId: string; name: string; nameNe: string | null; admissionNo: string };
  section: { publicId: string; name: string };
  rollNo: number | null;
  marksTh: DecimalLike | null;
  marksPr: DecimalLike | null;
  isAbsent: boolean;
  preview: {
    obtained: number;
    fullMarks: number;
    percent: number;
    letter: string;
    gradePoint: number;
    isNg: boolean;
  } | null;
};

export type MarksResponse = {
  exam: { publicId: string; name: string; status: ExamStatus };
  examSubject: {
    publicId: string;
    subject: { publicId: string; name: string; nameNe: string | null };
    class: { publicId: string; name: string };
    hasPractical: boolean;
    fullMarksTh: number;
    passMarksTh: number;
    fullMarksPr: number | null;
    passMarksPr: number | null;
  };
  roster: RosterRow[];
};

export type ResultRow = {
  publicId: string;
  student: { publicId: string; name: string; nameNe: string | null; admissionNo: string };
  class: { publicId: string; name: string } | null;
  section: { publicId: string; name: string } | null;
  rollNo: number | null;
  gpa: DecimalLike;
  status: "passed" | "failed";
  ngCount: number;
};

export type ResultsResponse = {
  exam: {
    publicId: string;
    name: string;
    nameNe: string | null;
    status: ExamStatus;
    publishedAt: string | null;
    academicYear: { publicId: string; name: string };
  };
  results: ResultRow[];
};

export type PublishResult = {
  publicId: string;
  name: string;
  status: ExamStatus;
  publishedAt: string;
  students: number;
  passed: number;
  failed: number;
};

export type AcademicYearOption = {
  publicId: string;
  name: string;
  isCurrent: boolean;
};
