/**
 * Notification router (§5.6) — sendNotification() with channel-priority
 * routing, per-school fallback, and credit metering.
 */

import type { NotificationChannel } from "@prisma/client";
import { getAdapter, type SendResult } from "./channels";
import { renderTemplate } from "./templates";

export type NotificationRecipient = {
  guardianId?: bigint;
  studentId?: bigint;
  phone: string;
  name: string;
  preferredChannel?: NotificationChannel;
};

export type SendNotificationInput = {
  tenantId: bigint;
  recipients: NotificationRecipient[];
  template?: {
    id: bigint;
    bodyEn: string;
    bodyNe?: string | null;
    slug: string;
  };
  /** Direct message body (for bulk/custom sends without template). */
  directBody?: { en: string; ne?: string };
  variables: Record<string, string | number | null | undefined>;
  /** Per-school channel priority order. */
  channelPriority: NotificationChannel[];
  triggerType?: string;
  triggerEventId?: bigint;
  subject?: string;
};

export type NotificationResult = {
  recipientPhone: string;
  recipientName: string;
  guardianId?: bigint;
  studentId?: bigint;
  channel: NotificationChannel;
  status: "sent" | "failed";
  providerRef?: string;
  errorMessage?: string;
  costPaisa: number;
  bodyEn: string;
  bodyNe?: string;
  templateId?: bigint;
  triggerType?: string;
  triggerEventId?: bigint;
};

/**
 * Route a notification through the channel priority list with fallback.
 * Tries each channel in order; stops on the first success.
 */
export async function routeNotification(
  phone: string,
  message: string,
  channelPriority: NotificationChannel[],
): Promise<{ channel: NotificationChannel; result: SendResult }> {
  for (const ch of channelPriority) {
    const adapter = getAdapter(ch);
    if (!adapter) continue;
    const result = await adapter.send({ phone, message });
    if (result.success) {
      return { channel: ch as NotificationChannel, result };
    }
    // Channel failed → try next in fallback order
  }
  // All channels exhausted
  const lastChannel = channelPriority[channelPriority.length - 1] ?? "sms";
  return {
    channel: lastChannel as NotificationChannel,
    result: {
      success: false,
      errorMessage: "All channels exhausted",
      costPaisa: 0,
    },
  };
}

/**
 * Send notifications to a list of recipients using template rendering
 * and channel routing. Returns per-recipient results for persistence.
 */
export async function sendNotifications(
  input: SendNotificationInput,
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];

  for (const recipient of input.recipients) {
    const vars = {
      ...input.variables,
      guardianName: recipient.name,
    };

    // Render message body
    let bodyEn: string;
    let bodyNe: string | undefined;

    if (input.template) {
      bodyEn = renderTemplate(input.template.bodyEn, vars);
      bodyNe = input.template.bodyNe
        ? renderTemplate(input.template.bodyNe, vars)
        : undefined;
    } else if (input.directBody) {
      bodyEn = renderTemplate(input.directBody.en, vars);
      bodyNe = input.directBody.ne
        ? renderTemplate(input.directBody.ne, vars)
        : undefined;
    } else {
      bodyEn = "";
    }

    // Determine channel priority: recipient preference can bubble up
    let priority = [...input.channelPriority];
    if (recipient.preferredChannel) {
      const pref = recipient.preferredChannel;
      priority = [pref, ...priority.filter((c) => c !== pref)];
    }

    // Use Nepali body if available, otherwise English
    const messageToSend = bodyNe || bodyEn;

    const { channel, result } = await routeNotification(
      recipient.phone,
      messageToSend,
      priority,
    );

    results.push({
      recipientPhone: recipient.phone,
      recipientName: recipient.name,
      guardianId: recipient.guardianId,
      studentId: recipient.studentId,
      channel,
      status: result.success ? "sent" : "failed",
      providerRef: result.providerRef,
      errorMessage: result.errorMessage,
      costPaisa: result.costPaisa,
      bodyEn,
      bodyNe,
      templateId: input.template?.id,
      triggerType: input.triggerType,
      triggerEventId: input.triggerEventId,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
// Channel settings helpers
// ─────────────────────────────────────────────────────────────

/** Default channel priority per master plan §12 decision #6. */
export const DEFAULT_CHANNEL_PRIORITY: NotificationChannel[] = [
  "whatsapp",
  "sms",
  "viber",
];

/** Read channel priority from tenant settings JSON. */
export function channelPriorityOf(
  settings: unknown,
): NotificationChannel[] {
  const raw =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>).channelPriority
      : undefined;
  if (Array.isArray(raw) && raw.length > 0) {
    const valid = raw.filter(
      (c): c is NotificationChannel =>
        typeof c === "string" &&
        ["whatsapp", "sms", "viber", "push"].includes(c),
    );
    if (valid.length > 0) return valid;
  }
  return DEFAULT_CHANNEL_PRIORITY;
}
