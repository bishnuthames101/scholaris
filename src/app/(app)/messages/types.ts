export type NotificationChannel = "whatsapp" | "sms" | "viber" | "push";
export type NotificationStatus = "pending" | "queued" | "sent" | "delivered" | "failed" | "cancelled";

export type Template = {
  publicId: string;
  name: string;
  nameNe: string | null;
  slug: string;
  bodyEn: string;
  bodyNe: string | null;
  variables: string[];
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
};

export type NotificationLog = {
  publicId: string;
  recipientPhone: string | null;
  recipientName: string | null;
  channel: NotificationChannel;
  status: NotificationStatus;
  subject: string | null;
  bodyEn: string;
  bodyNe: string | null;
  triggerType: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  retryCount: number;
  costPaisa: number;
  createdAt: string;
  template: { publicId: string; name: string; slug: string } | null;
};

export type CreditBalance = {
  balance: number;
  totalUsed: number;
  transactions: CreditTransaction[];
};

export type CreditTransaction = {
  publicId: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  reference: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type ContactGroup = {
  publicId: string;
  name: string;
  nameNe: string | null;
  type: string;
  _count: { members: number };
  createdAt: string;
};

export type ClassOption = {
  publicId: string;
  name: string;
  gradeLevel: number;
  sections: { publicId: string; name: string }[];
};
