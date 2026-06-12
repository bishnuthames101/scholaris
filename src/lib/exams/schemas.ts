import { z } from "zod";

export const BandSchema = z.object({
  letter: z.string().min(1).max(5),
  letterNe: z.string().max(10).optional(),
  gradePoint: z.number().min(0).max(10),
  minPercent: z.number().min(0).max(100),
  maxPercent: z.number().min(0).max(100),
  isPassing: z.boolean(),
});

export const EXAM_ADMIN_ROLES = ["school_admin", "principal"];
export const MARKS_ROLES = ["school_admin", "principal", "teacher", "class_teacher"];
