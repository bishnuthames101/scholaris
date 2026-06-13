/**
 * Template rendering engine for notification messages.
 * Supports bilingual templates with {{variable}} placeholders.
 */

const VAR_RE = /\{\{(\w+)\}\}/g;

/** Render a template body, replacing {{var}} placeholders with values. */
export function renderTemplate(
  body: string,
  variables: Record<string, string | number | null | undefined>,
): string {
  return body.replace(VAR_RE, (_match, key: string) => {
    const val = variables[key];
    return val != null ? String(val) : "";
  });
}

/** Extract variable names from a template body. */
export function extractVariables(body: string): string[] {
  const vars = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = VAR_RE.exec(body)) !== null) {
    vars.add(m[1]);
  }
  return [...vars];
}

/** Validate that all required variables are provided. */
export function validateVariables(
  template: { variables: string[] },
  provided: Record<string, unknown>,
): string[] {
  return template.variables.filter((v) => !(v in provided));
}

// ─────────────────────────────────────────────────────────────
// Default system templates (seeded per tenant on first use)
// ─────────────────────────────────────────────────────────────

export type SystemTemplate = {
  slug: string;
  name: string;
  nameNe: string;
  bodyEn: string;
  bodyNe: string;
  variables: string[];
};

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    slug: "absence_alert",
    name: "Absence Alert",
    nameNe: "अनुपस्थिति सूचना",
    bodyEn:
      "Dear {{guardianName}}, your child {{studentName}} ({{class}}) was absent on {{date}}. Please contact the school if needed.",
    bodyNe:
      "नमस्कार {{guardianName}}, तपाईंको बच्चा {{studentName}} ({{class}}) मिति {{date}} मा अनुपस्थित रहेको जानकारी गराउँछौं।",
    variables: ["guardianName", "studentName", "class", "date"],
  },
  {
    slug: "fee_due",
    name: "Fee Due Reminder",
    nameNe: "शुल्क भुक्तानी सम्झना",
    bodyEn:
      "Dear {{guardianName}}, a fee of Rs. {{amount}} is due for {{studentName}} ({{class}}). Invoice: {{invoiceNo}}. Please pay by {{dueDate}}.",
    bodyNe:
      "नमस्कार {{guardianName}}, {{studentName}} ({{class}}) को रु. {{amount}} शुल्क बाँकी छ। बिल नं: {{invoiceNo}}। कृपया {{dueDate}} सम्ममा भुक्तानी गर्नुहोस्।",
    variables: ["guardianName", "studentName", "class", "amount", "invoiceNo", "dueDate"],
  },
  {
    slug: "fee_overdue",
    name: "Fee Overdue Notice",
    nameNe: "शुल्क म्याद सकियो",
    bodyEn:
      "Dear {{guardianName}}, the fee of Rs. {{amount}} for {{studentName}} ({{class}}) is overdue. Invoice: {{invoiceNo}}. Please pay immediately.",
    bodyNe:
      "नमस्कार {{guardianName}}, {{studentName}} ({{class}}) को रु. {{amount}} शुल्कको म्याद सकिएको छ। बिल नं: {{invoiceNo}}। कृपया तुरुन्तै भुक्तानी गर्नुहोस्।",
    variables: ["guardianName", "studentName", "class", "amount", "invoiceNo"],
  },
  {
    slug: "results_published",
    name: "Exam Results Published",
    nameNe: "परीक्षा नतिजा प्रकाशित",
    bodyEn:
      "Dear {{guardianName}}, the results of {{examName}} for {{studentName}} ({{class}}) have been published. GPA: {{gpa}}. Please check the portal.",
    bodyNe:
      "नमस्कार {{guardianName}}, {{studentName}} ({{class}}) को {{examName}} को नतिजा प्रकाशित भएको छ। GPA: {{gpa}}। कृपया पोर्टलमा हेर्नुहोस्।",
    variables: ["guardianName", "studentName", "class", "examName", "gpa"],
  },
  {
    slug: "notice",
    name: "School Notice",
    nameNe: "विद्यालय सूचना",
    bodyEn: "Dear {{guardianName}}, notice from {{schoolName}}: {{noticeTitle}}. {{noticeBody}}",
    bodyNe: "नमस्कार {{guardianName}}, {{schoolName}} बाट सूचना: {{noticeTitle}}। {{noticeBody}}",
    variables: ["guardianName", "schoolName", "noticeTitle", "noticeBody"],
  },
  {
    slug: "rfid_tap",
    name: "RFID Entry/Exit Alert",
    nameNe: "RFID प्रवेश/निकास सूचना",
    bodyEn:
      "{{studentName}} ({{class}}) {{direction}} school at {{time}} on {{date}}.",
    bodyNe:
      "{{studentName}} ({{class}}) मिति {{date}} मा {{time}} बजे विद्यालयमा {{direction}}।",
    variables: ["studentName", "class", "direction", "time", "date"],
  },
  {
    slug: "bulk_message",
    name: "General Message",
    nameNe: "सामान्य सन्देश",
    bodyEn: "{{message}}",
    bodyNe: "{{message}}",
    variables: ["message"],
  },
];
