import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";
import {
  sendNotifications,
  channelPriorityOf,
  ensureSystemTemplates,
  deductCredits,
} from "@/lib/notifications";
import type { NotificationRecipient } from "@/lib/notifications";

const sendSchema = z.object({
  templateSlug: z.string().optional(),
  bodyEn: z.string().optional(),
  bodyNe: z.string().optional(),
  variables: z.record(z.string(), z.string().or(z.number()).nullable()).default({}),
  subject: z.string().optional(),
  /** Send to specific phone numbers with names. */
  recipients: z
    .array(
      z.object({
        phone: z.string().min(1),
        name: z.string().min(1),
      }),
    )
    .optional(),
  /** Send to all guardians in a class/section. */
  classPublicId: z.string().uuid().optional(),
  sectionPublicId: z.string().uuid().optional(),
  /** Send to a contact group. */
  groupPublicId: z.string().uuid().optional(),
});

export const POST = handler(async (req: Request) => {
  const { tenantId, session } = await requireTenantWrite();
  const body = await parseBody(req, sendSchema);

  if (!body.templateSlug && !body.bodyEn) {
    throw new ApiError("MISSING_BODY", "Provide either templateSlug or bodyEn", 400);
  }

  const result = await withTenant(
    tenantId,
    async (tx) => {
      await ensureSystemTemplates(tx as never, tenantId);

      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { settings: true },
      });
      const channelPriority = channelPriorityOf(tenant.settings);

      // Resolve template if slug provided
      let template: { id: bigint; bodyEn: string; bodyNe: string | null; slug: string } | undefined;
      if (body.templateSlug) {
        const t = await tx.notificationTemplate.findFirst({
          where: { tenantId, slug: body.templateSlug, isActive: true, deletedAt: null },
          select: { id: true, bodyEn: true, bodyNe: true, slug: true },
        });
        if (!t) throw new ApiError("TEMPLATE_NOT_FOUND", `Template "${body.templateSlug}" not found`, 404);
        template = t;
      }

      // Resolve recipients
      const recipients: NotificationRecipient[] = [];

      if (body.recipients && body.recipients.length > 0) {
        for (const r of body.recipients) {
          recipients.push({ phone: r.phone, name: r.name });
        }
      }

      if (body.classPublicId || body.sectionPublicId) {
        // Resolve guardians from class/section enrollments
        const whereSection: Record<string, unknown> = {};
        if (body.sectionPublicId) {
          const section = await tx.section.findFirst({
            where: { tenantId, publicId: body.sectionPublicId, deletedAt: null },
            select: { id: true },
          });
          if (section) whereSection.sectionId = section.id;
        } else if (body.classPublicId) {
          const cls = await tx.schoolClass.findFirst({
            where: { tenantId, publicId: body.classPublicId, deletedAt: null },
            select: { id: true },
          });
          if (cls) {
            const sections = await tx.section.findMany({
              where: { tenantId, classId: cls.id, deletedAt: null },
              select: { id: true },
            });
            whereSection.sectionId = { in: sections.map((s) => s.id) };
          }
        }

        const enrollments = await tx.enrollment.findMany({
          where: {
            tenantId,
            deletedAt: null,
            ...whereSection,
            academicYear: { isCurrent: true },
            student: { status: "active", deletedAt: null },
          },
          select: {
            student: {
              select: {
                id: true,
                guardians: {
                  select: {
                    guardian: {
                      select: { id: true, name: true, phone: true, preferredChannel: true, deletedAt: true },
                    },
                  },
                },
              },
            },
          },
        });

        const seenPhones = new Set(recipients.map((r) => r.phone));
        for (const e of enrollments) {
          for (const sg of e.student.guardians) {
            const g = sg.guardian;
            if (g.deletedAt || !g.phone || seenPhones.has(g.phone)) continue;
            seenPhones.add(g.phone);
            recipients.push({
              guardianId: g.id,
              studentId: e.student.id,
              phone: g.phone,
              name: g.name,
              preferredChannel: g.preferredChannel,
            });
          }
        }
      }

      if (body.groupPublicId) {
        const group = await tx.contactGroup.findFirst({
          where: { tenantId, publicId: body.groupPublicId, deletedAt: null },
          select: { id: true },
        });
        if (group) {
          const members = await tx.contactGroupMember.findMany({
            where: { groupId: group.id },
          });
          const seenPhones = new Set(recipients.map((r) => r.phone));
          for (const m of members) {
            const phone = m.phone;
            if (!phone || seenPhones.has(phone)) continue;
            seenPhones.add(phone);
            recipients.push({
              guardianId: m.guardianId ?? undefined,
              phone,
              name: m.name ?? "Unknown",
            });
          }
        }
      }

      if (recipients.length === 0) {
        throw new ApiError("NO_RECIPIENTS", "No recipients found", 400);
      }

      // Credit check — lock the row to prevent concurrent over-spend
      const [creditRow] = await tx.$queryRawUnsafe<{ balance: number }[]>(
        `SELECT balance FROM message_credits WHERE tenant_id = $1 FOR UPDATE`,
        tenantId,
      );
      const balance = creditRow?.balance ?? 0;
      if (balance < recipients.length) {
        throw new ApiError(
          "INSUFFICIENT_CREDITS",
          `Need ${recipients.length} credits but have ${balance}`,
          402,
          { required: recipients.length, available: balance },
        );
      }

      // Send
      const results = await sendNotifications({
        tenantId,
        recipients,
        template,
        directBody: template ? undefined : { en: body.bodyEn!, ne: body.bodyNe },
        variables: body.variables as Record<string, string | number | null>,
        channelPriority,
        triggerType: "bulk",
        subject: body.subject,
      });

      // Persist notifications + deduct credits
      let sentCount = 0;
      let failedCount = 0;

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
            subject: body.subject ?? null,
            bodyEn: r.bodyEn,
            bodyNe: r.bodyNe ?? null,
            variables: body.variables as Prisma.InputJsonValue,
            triggerType: "bulk",
            sentAt: r.status === "sent" ? new Date() : null,
            failedAt: r.status === "failed" ? new Date() : null,
            errorMessage: r.errorMessage ?? null,
            costPaisa: r.costPaisa,
          },
        });

        if (r.status === "sent") {
          sentCount++;
          await deductCredits(tx as never, tenantId, 1, "bulk_send", r.providerRef, session.sub);
        } else {
          failedCount++;
        }
      }

      await audit(tx, {
        tenantId,
        action: "bulk_send",
        entity: "notifications",
        after: {
          recipientCount: recipients.length,
          sent: sentCount,
          failed: failedCount,
          templateSlug: body.templateSlug ?? null,
        },
      });

      return { sent: sentCount, failed: failedCount, total: recipients.length };
    },
    { timeoutMs: 120_000 },
  );

  return ok(result);
});
