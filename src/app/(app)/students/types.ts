export type SectionRef = {
  publicId: string;
  name: string;
  class: { publicId: string; name: string; gradeLevel: number };
};

export type StudentRow = {
  publicId: string;
  admissionNo: string;
  name: string;
  nameNe?: string | null;
  gender: "male" | "female" | "other";
  status: "active" | "transferred" | "graduated" | "dropped";
  phone?: string | null;
  photoUrl?: string | null;
  currentEnrollment: {
    publicId: string;
    rollNo?: number | null;
    status: string;
    section: SectionRef;
  } | null;
};

export type ClassOption = {
  publicId: string;
  name: string;
  nameNe?: string | null;
  gradeLevel: number;
  stream?: string | null;
  sections: {
    publicId: string;
    name: string;
    capacity?: number | null;
    classTeacher?: { publicId: string; name: string } | null;
    _count?: { enrollments: number };
  }[];
  _count?: { subjects: number };
};
