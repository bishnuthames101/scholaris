export type FeeFrequency = "monthly" | "quarterly" | "annual" | "one_time";
export type InvoiceStatus = "issued" | "partially_paid" | "paid" | "void";
export type PaymentMethod = "cash" | "bank" | "esewa" | "khalti";
export type PaymentStatus = "pending" | "completed" | "failed" | "cancelled";

export type FeeHead = {
  publicId: string;
  name: string;
  nameNe: string | null;
  sortOrder: number;
  _count?: { structures: number };
};

export type StructureRow = {
  publicId: string;
  amountPaisa: number;
  frequency: FeeFrequency;
  feeHead: { publicId: string; name: string; nameNe: string | null; sortOrder: number };
};

export type StructureResponse = {
  year: { publicId: string; name: string } | null;
  rows: StructureRow[];
};

export type InvoiceListRow = {
  publicId: string;
  invoiceNo: string;
  fiscalYear: string;
  bsYear: number | null;
  bsMonth: number | null;
  issueDate: string;
  dueDate: string | null;
  subtotalPaisa: number;
  discountPaisa: number;
  finePaisa: number;
  totalPaisa: number;
  paidPaisa: number;
  status: InvoiceStatus;
  printCount: number;
  createdAt: string;
  student: { publicId: string; name: string; nameNe: string | null; admissionNo: string };
};

export type InvoiceDetail = InvoiceListRow & {
  note: string | null;
  voidReason: string | null;
  voidedAt: string | null;
  student: InvoiceListRow["student"] & {
    enrollments: {
      rollNo: number | null;
      section: { name: string; class: { name: string } };
    }[];
  };
  items: {
    kind: "fee" | "fine";
    label: string;
    labelNe: string | null;
    amountPaisa: number;
    discountPaisa: number;
  }[];
  payments: PaymentRow[];
};

export type PaymentRow = {
  publicId: string;
  receiptNo: string | null;
  method: PaymentMethod;
  amountPaisa: number;
  status: PaymentStatus;
  reference: string | null;
  providerRef: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type InitiateResult =
  | { kind: "form"; action: string; fields: Record<string, string> }
  | { kind: "redirect"; url: string; providerRef: string };

export type GenerateResult = {
  created: number;
  skipped: number;
  totalPaisa: number;
  invoices: { publicId: string; invoiceNo: string }[];
};

export type AgingReport = {
  asOf: string;
  totals: {
    currentPaisa: number;
    d1_30Paisa: number;
    d31_60Paisa: number;
    d61_90Paisa: number;
    d90pPaisa: number;
    totalPaisa: number;
  };
  rows: {
    studentId: string;
    name: string;
    admissionNo: string;
    className: string | null;
    currentPaisa: number;
    d1_30Paisa: number;
    d31_60Paisa: number;
    d61_90Paisa: number;
    d90pPaisa: number;
    totalPaisa: number;
  }[];
};

export type DailyCollection = {
  date: string;
  count: number;
  totalPaisa: number;
  byMethod: Record<string, { count: number; totalPaisa: number }>;
  payments: {
    publicId: string;
    receiptNo: string | null;
    method: PaymentMethod;
    amountPaisa: number;
    reference: string | null;
    providerRef: string | null;
    paidAt: string | null;
    invoice: { publicId: string; invoiceNo: string };
    student: { publicId: string; name: string; admissionNo: string };
  }[];
};

export type Statement = {
  student: {
    publicId: string;
    name: string;
    nameNe: string | null;
    admissionNo: string;
    className: string | null;
    sectionName: string | null;
    rollNo: number | null;
  };
  entries: {
    publicId: string;
    type: "invoice_issued" | "payment_received" | "payment_reversed" | "invoice_voided";
    debitPaisa: number;
    creditPaisa: number;
    narration: string | null;
    createdAt: string;
    balancePaisa: number;
  }[];
  totals: { debitPaisa: number; creditPaisa: number; balancePaisa: number };
};
