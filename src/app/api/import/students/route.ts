import { z } from "zod";
import Papa from "papaparse";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";
import { bsToAd } from "@/lib/dates/bs";

const MAX_ROWS = 500;

const emptyToUndef = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  const t = v.trim();
  return t === "" ? undefined : t;
};
const lowerOrUndef = (v: unknown): unknown => {
  const t = emptyToUndef(v);
  return typeof t === "string" ? t.toLowerCase() : t;
};

const optStr = z.preprocess(emptyToUndef, z.string().optional());
const dateStr = z.preprocess(
  emptyToUndef,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").optional(),
);

const RowSchema = z.object({
  admission_no: z.preprocess(emptyToUndef, z.string().min(1)),
  name: z.preprocess(emptyToUndef, z.string().min(2)),
  name_ne: optStr,
  gender: z.preprocess((v) => {
    const s = lowerOrUndef(v);
    if (s === "m") return "male";
    if (s === "f") return "female";
    return s;
  }, z.enum(["male", "female", "other"])),
  dob_ad: dateStr,
  dob_bs: dateStr,
  grade: z.preprocess(emptyToUndef, z.coerce.number().int().min(-1).max(12).optional()),
  stream: z.preprocess(
    lowerOrUndef,
    z.enum(["science", "management", "humanities", "education"]).optional(),
  ),
  section: optStr,
  roll_no: z.preprocess(emptyToUndef, z.coerce.number().int().positive().optional()),
  address: optStr,
  phone: optStr,
  blood_group: optStr,
  guardian_name: optStr,
  guardian_phone: optStr,
  guardian_relation: z.preprocess(
    lowerOrUndef,
    z
      .enum([
        "father",
        "mother",
        "grandfather",
        "grandmother",
        "uncle",
        "aunt",
        "brother",
        "sister",
        "other",
      ])
      .default("other"),
  ),
  guardian_channel: z.preprocess(
    lowerOrUndef,
    z.enum(["whatsapp", "sms", "viber", "push"]).default("whatsapp"),
  ),
});

type Row = z.infer<typeof RowSchema>;

function classKey(gradeLevel: number, stream: string | null | undefined): string {
  return `${gradeLevel}|${stream ?? ""}`;
}

function parseDob(row: Row, rowNo: number, errors: { row: number; message: string }[]): Date | undefined {
  if (row.dob_ad) {
    const d = new Date(`${row.dob_ad}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
      errors.push({ row: rowNo, message: `Invalid dob_ad "${row.dob_ad}"` });
      return undefined;
    }
    return d;
  }
  if (row.dob_bs) {
    const [year, month, day] = row.dob_bs.split("-").map(Number);
    try {
      return bsToAd({ year, month, day });
    } catch {
      errors.push({ row: rowNo, message: `Invalid dob_bs "${row.dob_bs}"` });
      return undefined;
    }
  }
  return undefined;
}

/** POST /api/import/students — bulk import students from CSV. */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite();

  const contentType = req.headers.get("content-type") ?? "";
  let csv: string;
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      throw new ApiError("NO_FILE", 'Multipart field "file" (CSV) is required', 400);
    csv = await file.text();
  } else {
    const body = await parseBody(req, z.object({ csv: z.string().min(1) }));
    csv = body.csv;
  }

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const rawRows = parsed.data;
  if (rawRows.length > MAX_ROWS)
    throw new ApiError("TOO_MANY_ROWS", `CSV exceeds the limit of ${MAX_ROWS} data rows`, 413);

  const result = await withTenant(tenantId, async (tx) => {
    const errors: { row: number; message: string }[] = [];

    // ── Pre-fetch lookups ────────────────────────────────────
    const currentYear = await tx.academicYear.findFirst({
      where: { tenantId, isCurrent: true, deletedAt: null },
      select: { id: true },
    });

    const classes = await tx.schoolClass.findMany({
      where: { tenantId, deletedAt: null },
      include: { sections: { where: { deletedAt: null }, select: { id: true, name: true } } },
    });
    const classByKey = new Map(classes.map((c) => [classKey(c.gradeLevel, c.stream), c]));

    // ── Validate rows ────────────────────────────────────────
    type ValidRow = { rowNo: number; row: Row; dob?: Date; sectionId?: bigint };
    const validRows: ValidRow[] = [];
    const seenAdmissionNos = new Set<string>();

    for (let i = 0; i < rawRows.length; i++) {
      const rowNo = i + 1; // 1-based data row
      const check = RowSchema.safeParse(rawRows[i]);
      if (!check.success) {
        const issue = check.error.issues[0];
        errors.push({
          row: rowNo,
          message: `${issue.path.join(".") || "row"}: ${issue.message}`,
        });
        continue;
      }
      const row = check.data;

      if (seenAdmissionNos.has(row.admission_no)) {
        errors.push({
          row: rowNo,
          message: `Duplicate admission_no "${row.admission_no}" in file`,
        });
        continue;
      }

      const preErrors = errors.length;
      const dob = parseDob(row, rowNo, errors);
      if (errors.length > preErrors) continue;

      // Resolve grade + stream + section → section id
      let sectionId: bigint | undefined;
      if (row.section) {
        if (row.grade === undefined) {
          errors.push({ row: rowNo, message: "grade is required when section is given" });
          continue;
        }
        if (!currentYear) {
          errors.push({ row: rowNo, message: "No current academic year configured" });
          continue;
        }
        const cls = classByKey.get(classKey(row.grade, row.stream));
        if (!cls) {
          errors.push({
            row: rowNo,
            message: `Class not found for grade ${row.grade}${row.stream ? ` (${row.stream})` : ""}`,
          });
          continue;
        }
        const section = cls.sections.find(
          (s) => s.name.toLowerCase() === row.section!.toLowerCase(),
        );
        if (!section) {
          errors.push({
            row: rowNo,
            message: `Section "${row.section}" not found in ${cls.name}`,
          });
          continue;
        }
        sectionId = section.id;
      }

      seenAdmissionNos.add(row.admission_no);
      validRows.push({ rowNo, row, dob, sectionId });
    }

    // ── Check admission numbers already in DB ────────────────
    const existing = await tx.student.findMany({
      where: { tenantId, admissionNo: { in: [...seenAdmissionNos] } },
      select: { admissionNo: true },
    });
    const existingAdmissionNos = new Set(existing.map((s) => s.admissionNo));

    // ── Pre-fetch reusable guardians by phone ────────────────
    const guardianPhones = [
      ...new Set(
        validRows
          .filter((v) => v.row.guardian_name && v.row.guardian_phone)
          .map((v) => v.row.guardian_phone!),
      ),
    ];
    const existingGuardians = await tx.guardian.findMany({
      where: { tenantId, phone: { in: guardianPhones }, deletedAt: null },
      select: { id: true, name: true, phone: true },
    });
    const guardianByKey = new Map(
      existingGuardians.map((g) => [`${g.phone}|${g.name.toLowerCase()}`, g.id]),
    );

    // ── Create (batched — pooler round-trips are expensive) ──
    const insertable = validRows.filter((v) => {
      if (existingAdmissionNos.has(v.row.admission_no)) {
        errors.push({
          row: v.rowNo,
          message: `admission_no "${v.row.admission_no}" already exists`,
        });
        return false;
      }
      return true;
    });

    const createdStudents = insertable.length
      ? await tx.student.createManyAndReturn({
          data: insertable.map(({ row, dob }) => ({
            tenantId,
            admissionNo: row.admission_no,
            name: row.name,
            nameNe: row.name_ne,
            gender: row.gender,
            dob,
            address: row.address,
            phone: row.phone,
            bloodGroup: row.blood_group,
          })),
          select: { id: true, admissionNo: true },
        })
      : [];
    const studentIdByAdmissionNo = new Map(createdStudents.map((s) => [s.admissionNo, s.id]));

    // New guardians not already in DB
    const newGuardianByKey = new Map<
      string,
      { name: string; phone: string; preferredChannel: Row["guardian_channel"] }
    >();
    for (const { row } of insertable) {
      if (!row.guardian_name || !row.guardian_phone) continue;
      const key = `${row.guardian_phone}|${row.guardian_name.toLowerCase()}`;
      if (!guardianByKey.has(key) && !newGuardianByKey.has(key)) {
        newGuardianByKey.set(key, {
          name: row.guardian_name,
          phone: row.guardian_phone,
          preferredChannel: row.guardian_channel,
        });
      }
    }
    if (newGuardianByKey.size > 0) {
      const createdGuardians = await tx.guardian.createManyAndReturn({
        data: [...newGuardianByKey.values()].map((g) => ({ tenantId, ...g })),
        select: { id: true, name: true, phone: true },
      });
      for (const g of createdGuardians) {
        guardianByKey.set(`${g.phone}|${g.name.toLowerCase()}`, g.id);
      }
    }

    const guardianLinks: {
      studentId: bigint;
      guardianId: bigint;
      relation: Row["guardian_relation"];
      isPrimary: boolean;
    }[] = [];
    const enrollmentRows: {
      tenantId: bigint;
      studentId: bigint;
      academicYearId: bigint;
      sectionId: bigint;
      rollNo?: number;
    }[] = [];

    for (const { row, sectionId } of insertable) {
      const studentId = studentIdByAdmissionNo.get(row.admission_no);
      if (!studentId) continue;
      if (row.guardian_name && row.guardian_phone) {
        const guardianId = guardianByKey.get(
          `${row.guardian_phone}|${row.guardian_name.toLowerCase()}`,
        );
        if (guardianId) {
          guardianLinks.push({
            studentId,
            guardianId,
            relation: row.guardian_relation,
            isPrimary: true,
          });
        }
      }
      if (sectionId && currentYear) {
        enrollmentRows.push({
          tenantId,
          studentId,
          academicYearId: currentYear.id,
          sectionId,
          rollNo: row.roll_no,
        });
      }
    }

    if (guardianLinks.length > 0) {
      await tx.studentGuardian.createMany({ data: guardianLinks });
    }
    if (enrollmentRows.length > 0) {
      await tx.enrollment.createMany({ data: enrollmentRows });
    }

    const createdCount = createdStudents.length;

    await audit(tx, {
      tenantId,
      action: "import",
      entity: "students",
      after: { created: createdCount, skipped: errors.length },
    });

    return { created: createdCount, skipped: errors.length, errors };
  }, { timeoutMs: 120_000 });

  return ok(result);
});
