import { readFileSync } from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { formatBs } from "@/lib/dates/bs";
import { scriptRuns } from "@/lib/fees/receipt-pdf";

/**
 * Bilingual (English + Nepali) A4 grade-sheet / marksheet PDF — NEB style:
 * per-subject theory/practical marks, letter grade + grade point, overall GPA.
 * Reuses the mixed-script run-splitting from the receipt renderer.
 */

const FONT_DIR = path.join(process.cwd(), "src", "assets", "fonts");
let fontCache: Record<string, Buffer> | null = null;

function fonts(): Record<string, Buffer> {
  fontCache ??= {
    latin: readFileSync(path.join(FONT_DIR, "NotoSans-Regular.ttf")),
    latinBold: readFileSync(path.join(FONT_DIR, "NotoSans-Bold.ttf")),
    deva: readFileSync(path.join(FONT_DIR, "NotoSansDevanagari-Regular.ttf")),
    devaBold: readFileSync(path.join(FONT_DIR, "NotoSansDevanagari-Bold.ttf")),
  };
  return fontCache;
}

export type MarksheetSubjectRow = {
  subject: string;
  subjectNe: string | null;
  hasPractical: boolean;
  fullMarksTh: number;
  fullMarksPr: number | null;
  marksTh: number | null;
  marksPr: number | null;
  isAbsent: boolean;
  obtained: number;
  fullMarks: number;
  percent: number;
  letter: string;
  gradePoint: number;
  isNg: boolean;
};

export type MarksheetPdfData = {
  school: {
    name: string;
    nameNe: string | null;
    address: string | null;
    phone: string | null;
  };
  exam: { name: string; nameNe: string | null; publishedAt: Date | null };
  academicYearName: string;
  student: {
    name: string;
    nameNe: string | null;
    admissionNo: string;
    className: string | null;
    sectionName: string | null;
    rollNo: number | null;
  };
  subjects: MarksheetSubjectRow[];
  gpa: number;
  status: "passed" | "failed";
  ngCount: number;
  /** Print number BEFORE this render: 0 = original, >0 = copy. */
  priorPrints: number;
};

export function renderMarksheetPdf(data: MarksheetPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const f = fonts();
    const doc = new PDFDocument({ size: "A4", margin: 40, font: f.latin as unknown as string });
    doc.registerFont("latin", f.latin);
    doc.registerFont("latinBold", f.latinBold);
    doc.registerFont("deva", f.deva);
    doc.registerFont("devaBold", f.devaBold);

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width;
    const M = 40;
    const innerW = W - M * 2;

    const brand = "#1d4ed8";
    const ink = "#111827";
    const muted = "#6b7280";
    const line = "#e5e7eb";
    const danger = "#b91c1c";

    function drawMixed(
      text: string,
      x: number,
      y: number,
      opts: {
        size: number;
        bold?: boolean;
        color?: string;
        width?: number;
        align?: "left" | "center" | "right";
      },
    ): void {
      const runs = scriptRuns(text);
      const faces = runs.map((r) =>
        r.deva ? (opts.bold ? "devaBold" : "deva") : opts.bold ? "latinBold" : "latin",
      );
      const widths = runs.map((r, i) => {
        doc.font(faces[i]).fontSize(opts.size);
        return doc.widthOfString(r.text);
      });
      const total = widths.reduce((a, b) => a + b, 0);
      let cx = x;
      if (opts.width && opts.align === "center") cx = x + (opts.width - total) / 2;
      if (opts.width && opts.align === "right") cx = x + opts.width - total;
      runs.forEach((r, i) => {
        doc
          .font(faces[i])
          .fontSize(opts.size)
          .fillColor(opts.color ?? ink)
          .text(r.text, cx, y, { lineBreak: false });
        cx += widths[i];
      });
    }

    // ── Header ─────────────────────────────────────────────
    let y = M;
    drawMixed(data.school.name, M, y, { size: 18, bold: true, width: innerW, align: "center" });
    y += 26;
    if (data.school.nameNe) {
      drawMixed(data.school.nameNe, M, y, { size: 13, bold: true, width: innerW, align: "center" });
      y += 20;
    }
    const contact = [data.school.address, data.school.phone && `Tel: ${data.school.phone}`]
      .filter(Boolean)
      .join("  ·  ");
    if (contact) {
      drawMixed(contact, M, y, { size: 8.5, color: muted, width: innerW, align: "center" });
      y += 14;
    }

    y += 8;
    drawMixed("GRADE-SHEET / लब्धाङ्क पत्र", M, y, {
      size: 13,
      bold: true,
      color: brand,
      width: innerW,
      align: "center",
    });
    y += 20;
    const examLine = data.exam.nameNe
      ? `${data.exam.name} (${data.exam.nameNe}) — ${data.academicYearName}`
      : `${data.exam.name} — ${data.academicYearName}`;
    drawMixed(examLine, M, y, { size: 10, width: innerW, align: "center" });
    y += 16;

    if (data.priorPrints > 0) {
      drawMixed(`COPY OF ORIGINAL / प्रतिलिपि — print #${data.priorPrints + 1}`, M, y, {
        size: 8.5,
        bold: true,
        color: danger,
        width: innerW,
        align: "center",
      });
      y += 14;
    }

    doc.moveTo(M, y).lineTo(W - M, y).strokeColor(line).lineWidth(1).stroke();
    y += 12;

    // ── Student block ──────────────────────────────────────
    const colW = innerW / 3;
    const studentLine = data.student.nameNe
      ? `${data.student.name} (${data.student.nameNe})`
      : data.student.name;
    drawMixed("Student / विद्यार्थी", M, y, { size: 7.5, color: muted });
    drawMixed(studentLine, M, y + 11, { size: 11, bold: true });
    const meta: Array<[string, string]> = [
      ["Adm. No / भर्ना नं.", data.student.admissionNo],
      [
        "Class / कक्षा",
        `${data.student.className ?? "—"}${data.student.sectionName ? ` ${data.student.sectionName}` : ""}`,
      ],
      ["Roll No / रोल नं.", data.student.rollNo != null ? String(data.student.rollNo) : "—"],
    ];
    meta.forEach(([label, value], i) => {
      const x = M + i * colW;
      drawMixed(label, x, y + 30, { size: 7.5, color: muted });
      drawMixed(value, x, y + 41, { size: 10, bold: true });
    });
    y += 64;

    // ── Subjects table ─────────────────────────────────────
    // Columns: SN | Subject | Full | Theory | Practical | Total | Grade | GP
    const cols = [
      { label: "S.N.", w: 0.055, align: "center" as const },
      { label: "Subject / विषय", w: 0.345, align: "left" as const },
      { label: "Full", w: 0.08, align: "center" as const },
      { label: "Theory", w: 0.1, align: "center" as const },
      { label: "Pract.", w: 0.1, align: "center" as const },
      { label: "Total", w: 0.09, align: "center" as const },
      { label: "Grade", w: 0.115, align: "center" as const },
      { label: "GP", w: 0.115, align: "center" as const },
    ];
    const colX: number[] = [];
    let acc = M;
    for (const c of cols) {
      colX.push(acc);
      acc += c.w * innerW;
    }

    const rowH = 22;
    // Header row
    doc.rect(M, y, innerW, rowH).fillColor("#eff6ff").fill();
    cols.forEach((c, i) => {
      drawMixed(c.label, colX[i] + 4, y + 6, {
        size: 8,
        bold: true,
        color: brand,
        width: c.w * innerW - 8,
        align: c.align,
      });
    });
    y += rowH;

    data.subjects.forEach((s, idx) => {
      if (idx % 2 === 1) {
        doc.rect(M, y, innerW, rowH).fillColor("#f9fafb").fill();
      }
      const subjectLabel = s.subjectNe ? `${s.subject} / ${s.subjectNe}` : s.subject;
      const cells = [
        String(idx + 1),
        subjectLabel,
        String(s.fullMarks),
        s.isAbsent ? "AB" : s.marksTh != null ? String(s.marksTh) : "—",
        s.hasPractical ? (s.isAbsent ? "AB" : s.marksPr != null ? String(s.marksPr) : "—") : "—",
        s.isAbsent ? "AB" : String(s.obtained),
        s.letter,
        s.gradePoint.toFixed(1),
      ];
      cells.forEach((cell, i) => {
        drawMixed(cell, colX[i] + 4, y + 6, {
          size: 8.5,
          bold: i === 6,
          color: i >= 6 && s.isNg ? danger : ink,
          width: cols[i].w * innerW - 8,
          align: cols[i].align,
        });
      });
      doc.moveTo(M, y + rowH).lineTo(W - M, y + rowH).strokeColor(line).lineWidth(0.5).stroke();
      y += rowH;
    });
    // Table borders
    doc.rect(M, y - rowH * (data.subjects.length + 1), innerW, rowH * (data.subjects.length + 1))
      .strokeColor(line)
      .lineWidth(0.8)
      .stroke();
    y += 14;

    // ── GPA box ────────────────────────────────────────────
    doc.roundedRect(M, y, innerW, 56, 6).fillColor("#eff6ff").fill();
    drawMixed("Grade Point Average (GPA) / ग्रेड बिन्दु औसत", M + 14, y + 9, {
      size: 7.5,
      color: muted,
    });
    drawMixed(data.gpa.toFixed(2), M + 14, y + 21, { size: 20, bold: true, color: brand });
    const statusLabel =
      data.status === "passed"
        ? "PASSED / उत्तीर्ण"
        : `NG IN ${data.ngCount} SUBJECT${data.ngCount > 1 ? "S" : ""} / अनुत्तीर्ण`;
    drawMixed(statusLabel, M + 14, y + 12, {
      size: 12,
      bold: true,
      color: data.status === "passed" ? "#15803d" : danger,
      width: innerW - 28,
      align: "right",
    });
    if (data.ngCount > 0) {
      drawMixed("NG subjects must be cleared via grade-increment examination.", M + 14, y + 32, {
        size: 7.5,
        color: muted,
        width: innerW - 28,
        align: "right",
      });
    }
    y += 70;

    // ── Signatures ─────────────────────────────────────────
    const footY = doc.page.height - 110;
    const sigW = 150;
    const sigs: Array<[number, string]> = [
      [M, "Class Teacher / कक्षा शिक्षक"],
      [W - M - sigW, "Principal / प्रधानाध्यापक"],
    ];
    for (const [x, label] of sigs) {
      doc.moveTo(x, footY).lineTo(x + sigW, footY).strokeColor(ink).lineWidth(0.7).stroke();
      drawMixed(label, x, footY + 5, { size: 7.5, color: muted });
    }

    const issued = data.exam.publishedAt ?? new Date();
    drawMixed(
      `Issued: ${formatBs(issued, "ne")} BS (${issued.toISOString().slice(0, 10)} AD) · Generated by Scholaris`,
      M,
      doc.page.height - 56,
      { size: 7, color: muted, width: innerW, align: "center" },
    );

    doc.end();
  });
}
