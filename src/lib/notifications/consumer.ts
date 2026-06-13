/**
 * Domain event consumer (§5.6).
 * Processes unprocessed DomainEvents and sends notifications through
 * the channel router. Each event type maps to a template + recipient resolution.
 *
 * Events consumed:
 * - attendance.absent → absence_alert template → student's guardians
 * - results.published → results_published template → all students' guardians in exam
 * - rfid.tap → rfid_tap template (only if messaging mode = per_tap)
 *
 * Fee events (fee.due, fee.overdue) are emitted by a scheduled check (see Phase 5.4 API).
 */

import type { NotificationChannel } from "@prisma/client";
import { sendNotifications, channelPriorityOf, ensureSystemTemplates } from "./index";
import type { NotificationRecipient, NotificationResult } from "./router";
import { attendanceSettingsOf } from "../attendance";
import { deductCredits } from "./credits";

type ConsumerTxClient = {
  domainEvent: {
    findMany: (args: {
      where: { tenantId?: bigint; processedAt: null; type?: { in: string[] } };
      orderBy: { createdAt: "asc" };
      take: number;
    }) => Promise<Array<{
      id: bigint;
      tenantId: bigint;
      type: string;
      payload: unknown;
      createdAt: Date;
    }>>;
    update: (args: {
      where: { id: bigint };
      data: { processedAt: Date };
    }) => Promise<unknown>;
  };
  tenant: {
    findUnique: (args: {
      where: { id: bigint };
      select: { publicId: true; name: true; nameNe: true; settings: true };
    }) => Promise<{
      publicId: string;
      name: string;
      nameNe: string | null;
      settings: unknown;
    } | null>;
  };
  notificationTemplate: {
    findFirst: (args: {
      where: { tenantId: bigint; slug: string; isActive: boolean; deletedAt: null };
      select: { id: true; bodyEn: true; bodyNe: true; slug: true };
    }) => Promise<{ id: bigint; bodyEn: string; bodyNe: string | null; slug: string } | null>;
    findMany?: unknown;
    createMany?: unknown;
  };
  student: {
    findUnique: (args: {
      where: { publicId: string };
      select: {
        id: true;
        name: true;
        nameNe: true;
        guardians: {
          select: {
            guardian: {
              select: {
                id: true;
                name: true;
                phone: true;
                preferredChannel: true;
                deletedAt: true;
              };
            };
          };
        };
      };
    }) => Promise<{
      id: bigint;
      name: string;
      nameNe: string | null;
      guardians: Array<{
        guardian: {
          id: bigint;
          name: string;
          phone: string;
          preferredChannel: NotificationChannel;
          deletedAt: Date | null;
        };
      }>;
    } | null>;
  };
  notification: {
    create: (args: { data: Record<string, unknown> }) => Promise<{ publicId: string }>;
  };
  messageCredit: {
    upsert: (args: Record<string, unknown>) => Promise<{ balance: number }>;
    findUnique: (args: Record<string, unknown>) => Promise<{ balance: number; totalUsed: number } | null>;
  };
  creditTransaction: {
    create: (args: Record<string, unknown>) => Promise<unknown>;
  };
};

type ConsumerResult = {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
};

/**
 * Process a batch of unprocessed domain events for a tenant.
 * Returns counts of processed/sent/failed.
 */
export async function processEvents(
  tx: ConsumerTxClient,
  tenantId: bigint,
  batchSize = 50,
): Promise<ConsumerResult> {
  const events = await tx.domainEvent.findMany({
    where: {
      tenantId,
      processedAt: null,
      type: { in: ["attendance.absent", "results.published", "rfid.tap"] },
    },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  if (events.length === 0) {
    return { processed: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: { publicId: true, name: true, nameNe: true, settings: true },
  });
  if (!tenant) return { processed: 0, sent: 0, failed: 0, skipped: 0 };

  const settings = attendanceSettingsOf(tenant.settings);
  const channelPriority = channelPriorityOf(tenant.settings);

  // Ensure system templates exist
  await ensureSystemTemplates(tx as never, tenantId);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const event of events) {
    const payload = event.payload as Record<string, unknown>;

    let results: NotificationResult[] = [];

    switch (event.type) {
      case "attendance.absent":
        results = await handleAbsenceEvent(tx, tenantId, event.id, payload, channelPriority);
        break;
      case "results.published":
        results = await handleResultsEvent(tx, tenantId, event.id, payload, channelPriority);
        break;
      case "rfid.tap":
        if (settings.messagingMode === "per_tap") {
          results = await handleRfidTapEvent(tx, tenantId, event.id, payload, channelPriority);
        } else {
          skipped++;
        }
        break;
    }

    // Persist notifications + deduct credits
    for (const r of results) {
      await tx.notification.create({
        data: {
          tenantId,
          templateId: r.templateId ?? null,
          recipientPhone: r.recipientPhone,
          recipientName: r.recipientName,
          guardianId: r.guardianId ?? null,
          studentId: r.studentId ?? null,
          channel: r.channel,
          status: r.status === "sent" ? "sent" : "failed",
          bodyEn: r.bodyEn,
          bodyNe: r.bodyNe ?? null,
          variables: {},
          triggerType: r.triggerType ?? null,
          triggerEventId: r.triggerEventId ?? null,
          sentAt: r.status === "sent" ? new Date() : null,
          failedAt: r.status === "failed" ? new Date() : null,
          errorMessage: r.errorMessage ?? null,
          costPaisa: r.costPaisa,
        },
      });

      if (r.status === "sent" && r.costPaisa > 0) {
        await deductCredits(
          tx as never,
          tenantId,
          1,
          event.type,
          r.providerRef,
        );
      }

      if (r.status === "sent") sent++;
      else failed++;
    }

    // Mark event as processed
    await tx.domainEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date() },
    });
  }

  return { processed: events.length, sent, failed, skipped };
}

// ─────────────────────────────────────────────────────────────
// Per-event-type handlers
// ─────────────────────────────────────────────────────────────

async function handleAbsenceEvent(
  tx: ConsumerTxClient,
  tenantId: bigint,
  eventId: bigint,
  payload: Record<string, unknown>,
  channelPriority: NotificationChannel[],
): Promise<NotificationResult[]> {
  const studentPublicId = payload.studentId as string;
  if (!studentPublicId) return [];

  const template = await tx.notificationTemplate.findFirst({
    where: { tenantId, slug: "absence_alert", isActive: true, deletedAt: null },
    select: { id: true, bodyEn: true, bodyNe: true, slug: true },
  });
  if (!template) return [];

  const recipients = await resolveGuardians(tx, studentPublicId);
  if (recipients.length === 0) return [];

  return sendNotifications({
    tenantId,
    recipients,
    template,
    variables: {
      studentName: payload.studentName as string,
      class: `${payload.class ?? ""}${payload.section ? " " + payload.section : ""}`,
      date: payload.date as string,
    },
    channelPriority,
    triggerType: "attendance.absent",
    triggerEventId: eventId,
  });
}

async function handleResultsEvent(
  tx: ConsumerTxClient,
  tenantId: bigint,
  eventId: bigint,
  payload: Record<string, unknown>,
  channelPriority: NotificationChannel[],
): Promise<NotificationResult[]> {
  const template = await tx.notificationTemplate.findFirst({
    where: { tenantId, slug: "results_published", isActive: true, deletedAt: null },
    select: { id: true, bodyEn: true, bodyNe: true, slug: true },
  });
  if (!template) return [];

  // Results payload has student summaries
  const students = (payload.students ?? []) as Array<{
    studentId: string;
    studentName: string;
    class: string;
    gpa: string;
  }>;

  const allResults: NotificationResult[] = [];
  for (const s of students) {
    const recipients = await resolveGuardians(tx, s.studentId);
    if (recipients.length === 0) continue;

    const results = await sendNotifications({
      tenantId,
      recipients,
      template,
      variables: {
        studentName: s.studentName,
        class: s.class,
        examName: payload.examName as string,
        gpa: s.gpa,
      },
      channelPriority,
      triggerType: "results.published",
      triggerEventId: eventId,
    });
    allResults.push(...results);
  }
  return allResults;
}

async function handleRfidTapEvent(
  tx: ConsumerTxClient,
  tenantId: bigint,
  eventId: bigint,
  payload: Record<string, unknown>,
  channelPriority: NotificationChannel[],
): Promise<NotificationResult[]> {
  const studentPublicId = payload.studentId as string;
  if (!studentPublicId) return [];

  const template = await tx.notificationTemplate.findFirst({
    where: { tenantId, slug: "rfid_tap", isActive: true, deletedAt: null },
    select: { id: true, bodyEn: true, bodyNe: true, slug: true },
  });
  if (!template) return [];

  const recipients = await resolveGuardians(tx, studentPublicId);
  if (recipients.length === 0) return [];

  return sendNotifications({
    tenantId,
    recipients,
    template,
    variables: {
      studentName: payload.studentName as string,
      class: payload.className as string,
      direction: payload.direction === "in" ? "entered" : "left",
      time: payload.time as string,
      date: payload.date as string,
    },
    channelPriority,
    triggerType: "rfid.tap",
    triggerEventId: eventId,
  });
}

// ─────────────────────────────────────────────────────────────
// Guardian resolution helper
// ─────────────────────────────────────────────────────────────

async function resolveGuardians(
  tx: ConsumerTxClient,
  studentPublicId: string,
): Promise<NotificationRecipient[]> {
  const student = await tx.student.findUnique({
    where: { publicId: studentPublicId },
    select: {
      id: true,
      name: true,
      nameNe: true,
      guardians: {
        select: {
          guardian: {
            select: { id: true, name: true, phone: true, preferredChannel: true, deletedAt: true },
          },
        },
      },
    },
  });
  if (!student) return [];

  return student.guardians
    .filter((sg) => sg.guardian.deletedAt === null && sg.guardian.phone)
    .map((sg) => ({
      guardianId: sg.guardian.id,
      studentId: student.id,
      phone: sg.guardian.phone,
      name: sg.guardian.name,
      preferredChannel: sg.guardian.preferredChannel,
    }));
}
