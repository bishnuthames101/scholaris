import { readFileSync } from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { formatBs } from "@/lib/dates/bs";
import { formatNpr } from "@/lib/fees/money";

/**
 * Bilingual (English + Nepali) A5 fee receipt PDF.
 * Fonts: Noto Sans (Latin) + Noto Sans Devanagari, embedded & subset by
 * pdfkit/fontkit. Mixed-script strings are split into per-script runs so each
 * glyph comes from a font that actually has it. The doc never touches
 * pdfkit's built-in AFM fonts, which keeps it bundler-safe.
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

const DEVA_CHAR = /[\u0900-\u097F]/;
// U+00B7 middle dot is missing from Noto Sans Devanagari, so force it Latin.
const LATIN_CHAR = /[A-Za-z0-9\u00B7]/;

/** Split a single-line string into Latin/Devanagari runs (neutral chars stick to the current run). */
export function scriptRuns(text: string): { text: string; deva: boolean }[] {
  const runs: { text: string; deva: boolean }[] = [];
  let cur = "";
  let curDeva = false;
  let started = false;
  for (const ch of text) {
    const isDeva = DEVA_CHAR.test(ch);
    const isLatin = LATIN_CHAR.test(ch);
    if (!started) {
      cur += ch;
      if (isDeva || isLatin) {
        started = true;
        curDeva = isDeva;
      }
      continue;
    }
    if ((isDeva && !curDeva) || (isLatin && curDeva)) {
      runs.push({ text: cur, deva: curDeva });
      cur = ch;
      curDeva = isDeva;
    } else {
      cur += ch;
    }
  }
  if (cur) runs.push({ text: cur, deva: curDeva });
  return runs;
}

export type ReceiptPdfData = {
  school: {
    name: string;
    nameNe: string | null;
    address: string | null;
    phone: string | null;
    panVatNo: string | null;
  };
  receiptNo: string;
  paidAt: Date;
  method: string;
  reference: string | null;
  providerRef: string | null;
  amountPaisa: number;
  invoiceNo: string;
  periodLabel: string | null; // e.g. "Jestha 2083"
  student: {
    name: string;
    nameNe: string | null;
    admissionNo: string;
    className: string | null;
    sectionName: string | null;
    rollNo: number | null;
  };
  receivedByName: string | null;
  /** Print number BEFORE this render: 0 = original, >0 = copy. */
  priorPrints: number;
};

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** Nepali-system number words (lakh/crore) for amounts on receipts. */
export function amountInWords(paisa: number): string {
  const rupees = Math.trunc(paisa / 100);
  const p = paisa % 100;
  function below100(n: number): string {
    if (n < 20) return ONES[n];
    return `${TENS[Math.trunc(n / 10)]}${n % 10 ? "-" + ONES[n % 10] : ""}`;
  }
  function words(n: number): string {
    if (n === 0) return "zero";
    const parts: string[] = [];
    const crore = Math.trunc(n / 10_000_000);
    const lakh = Math.trunc((n % 10_000_000) / 100_000);
    const thousand = Math.trunc((n % 100_000) / 1000);
    const hundred = Math.trunc((n % 1000) / 100);
    const rest = n % 100;
    if (crore) parts.push(`${words(crore)} crore`);
    if (lakh) parts.push(`${below100(lakh)} lakh`);
    if (thousand) parts.push(`${below100(thousand)} thousand`);
    if (hundred) parts.push(`${ONES[hundred]} hundred`);
    if (rest) parts.push(below100(rest));
    return parts.join(" ");
  }
  const main = `${words(rupees)} rupees`;
  return p > 0 ? `${main} and ${below100(p)} paisa only` : `${main} only`;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash / नगद",
  bank: "Bank / बैंक",
  esewa: "eSewa / ईसेवा",
  khalti: "Khalti / खल्ती",
};

export function renderReceiptPdf(data: ReceiptPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const f = fonts();
    // Types say `font: string`, but pdfkit accepts a Buffer at runtime — this
    // avoids ever loading the built-in AFM fonts (bundler-unsafe).
    const doc = new PDFDocument({ size: "A5", margin: 32, font: f.latin as unknown as string });
    doc.registerFont("latin", f.latin);
    doc.registerFont("latinBold", f.latinBold);
    doc.registerFont("deva", f.deva);
    doc.registerFont("devaBold", f.devaBold);

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width;
    const M = 32;
    const innerW = W - M * 2;

    const brand = "#1d4ed8";
    const ink = "#111827";
    const muted = "#6b7280";
    const line = "#e5e7eb";

    /**
     * Draw a single-line, possibly mixed-script string. Each script run is
     * measured and placed manually — no pdfkit `continued` quirks, correct
     * centering/right-alignment across font switches.
     */
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
    drawMixed(data.school.name, M, y, { size: 15, bold: true, width: innerW, align: "center" });
    y += 21;
    if (data.school.nameNe) {
      drawMixed(data.school.nameNe, M, y, { size: 11, bold: true, width: innerW, align: "center" });
      y += 18;
    }
    const contact = [data.school.address, data.school.phone && `Tel: ${data.school.phone}`]
      .filter(Boolean)
      .join("  ·  ");
    if (contact) {
      drawMixed(contact, M, y, { size: 7.5, color: muted, width: innerW, align: "center" });
      y += 11;
    }
    if (data.school.panVatNo) {
      drawMixed(`PAN: ${data.school.panVatNo}`, M, y, {
        size: 7.5,
        color: muted,
        width: innerW,
        align: "center",
      });
      y += 11;
    }

    y += 8;
    drawMixed("FEE RECEIPT / शुल्क रसिद", M, y, {
      size: 11.5,
      bold: true,
      color: brand,
      width: innerW,
      align: "center",
    });
    y += 18;

    // Reprint label (IRD: every print after the first is a copy).
    if (data.priorPrints > 0) {
      drawMixed(`COPY OF ORIGINAL / प्रतिलिपि — print #${data.priorPrints + 1}`, M, y, {
        size: 8,
        bold: true,
        color: "#b91c1c",
        width: innerW,
        align: "center",
      });
      y += 14;
    }

    doc.moveTo(M, y).lineTo(W - M, y).strokeColor(line).lineWidth(1).stroke();
    y += 10;

    // ── Meta grid ──────────────────────────────────────────
    const colW = innerW / 2;
    const meta: Array<[string, string]> = [
      ["Receipt No. / रसिद नं.", data.receiptNo],
      ["Date / मिति", `${formatBs(data.paidAt, "ne")}  (${data.paidAt.toISOString().slice(0, 10)} AD)`],
      ["Method / माध्यम", METHOD_LABELS[data.method] ?? data.method],
      ["Against Invoice / बीजक", data.invoiceNo + (data.periodLabel ? ` — ${data.periodLabel}` : "")],
    ];
    meta.forEach(([label, value], i) => {
      const x = M + (i % 2) * colW;
      const rowY = y + Math.trunc(i / 2) * 32;
      drawMixed(label, x, rowY, { size: 6.5, color: muted });
      drawMixed(value, x, rowY + 10, { size: 9, bold: true });
    });
    y += Math.ceil(meta.length / 2) * 32 + 6;

    // ── Student ────────────────────────────────────────────
    doc.moveTo(M, y).lineTo(W - M, y).strokeColor(line).stroke();
    y += 10;
    drawMixed("Received From (Student) / विद्यार्थी", M, y, { size: 6.5, color: muted });
    y += 10;
    const studentLine = data.student.nameNe
      ? `${data.student.name} (${data.student.nameNe})`
      : data.student.name;
    drawMixed(studentLine, M, y, { size: 10.5, bold: true });
    y += 16;
    const detail = [
      `Adm. No: ${data.student.admissionNo}`,
      data.student.className &&
        `Class: ${data.student.className}${data.student.sectionName ? ` ${data.student.sectionName}` : ""}`,
      data.student.rollNo != null && `Roll: ${data.student.rollNo}`,
    ]
      .filter(Boolean)
      .join("   ·   ");
    drawMixed(detail, M, y, { size: 7.5, color: muted });
    y += 18;

    // ── Amount box ─────────────────────────────────────────
    doc.roundedRect(M, y, innerW, 60, 6).fillColor("#eff6ff").fill();
    drawMixed("Amount Paid / भुक्तानी रकम", M + 14, y + 9, { size: 6.5, color: muted });
    drawMixed(formatNpr(data.amountPaisa, "en"), M + 14, y + 19, {
      size: 17,
      bold: true,
      color: brand,
    });
    drawMixed(formatNpr(data.amountPaisa, "ne"), M + 14, y + 42, { size: 9, color: brand });
    const ref = data.reference ?? data.providerRef;
    if (ref) {
      drawMixed(`Ref: ${ref}`, M + 14, y + 9, {
        size: 7,
        color: muted,
        width: innerW - 28,
        align: "right",
      });
    }
    y += 68;

    doc
      .font("latin")
      .fontSize(7.5)
      .fillColor(ink)
      .text(`In words: ${amountInWords(data.amountPaisa)}`, M, y, { width: innerW });

    // ── Footer ─────────────────────────────────────────────
    const footY = doc.page.height - 96;
    if (data.receivedByName) {
      drawMixed(data.receivedByName, M, footY - 13, { size: 8.5 });
    }
    doc.moveTo(M, footY).lineTo(M + 150, footY).strokeColor(ink).lineWidth(0.7).stroke();
    drawMixed("Received By / बुझिलिने", M, footY + 4, { size: 7, color: muted });

    drawMixed(
      `Generated by Scholaris · ${formatBs(new Date(), "ne")} · ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC`,
      M,
      doc.page.height - 48,
      { size: 6.5, color: muted, width: innerW, align: "center" },
    );

    doc.end();
  });
}
