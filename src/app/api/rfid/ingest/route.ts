import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ApiError, handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { authenticateDevice } from "@/lib/rfid-auth";
import { kathmanduDateString, toDbDate } from "@/lib/attendance";

/**
 * POST /api/rfid/ingest — batched swipe ingestion from RFID readers (§7.2/§7.3).
 *
 * Device-authenticated (HMAC over the raw body — see lib/rfid-auth).
 * Idempotent & replay-safe: rfid_events dedupes on (device, uid, tapped_at),
 * so resubmitting an offline buffer (or replaying a captured request) is a no-op.
 *
 * Pipeline: append raw events → resolve uid→student → upsert attendance
 * (present, first/last tap) → emit `rfid.tap` domain events (consumer for
 * per-tap messaging stays OFF until Phase 5 + per_tap mode) → bump device
 * last_seen / last_reported (the offline-vs-absent guard input).
 */

const swipeSchema = z.object({
  uid: z.string().min(1).max(64),
  ts: z.iso.datetime({ offset: true }),
  direction: z.enum(["in", "out"]).optional(),
});

const bodySchema = z.object({
  batchId: z.string().max(100).optional(),
  sentAt: z.iso.datetime({ offset: true }).optional(),
  swipes: z.array(swipeSchema).max(2000),
});

export const POST = handler(async (req: Request) => {
  const rawBody = await req.text();
  const device = await authenticateDevice(req, rawBody);

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(JSON.parse(rawBody));
  } catch (e) {
    if (e instanceof z.ZodError) throw e;
    throw new ApiError("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const { swipes, batchId } = parsed;

  const result = await withTenant(
    device.tenantId,
    async (tx) => {
      const now = new Date();

      // 1) Append raw events — skipDuplicates makes this idempotent.
      const inserted = await tx.rfidEvent.createManyAndReturn({
        data: swipes.map((s) => ({
          tenantId: device.tenantId,
          deviceId: device.id,
          rfidUid: s.uid,
          tappedAt: new Date(s.ts),
          direction: s.direction ?? null,
          syncBatchId: batchId ?? null,
        })),
        select: { id: true, rfidUid: true, tappedAt: true, direction: true },
        skipDuplicates: true,
      });

      // 2) Resolve uid → student for the newly inserted events.
      const uids = [...new Set(inserted.map((e) => e.rfidUid))];
      const students = uids.length
        ? await tx.student.findMany({
            where: {
              tenantId: device.tenantId,
              rfidUid: { in: uids },
              deletedAt: null,
            },
            select: { id: true, publicId: true, name: true, rfidUid: true },
          })
        : [];
      const byUid = new Map(students.map((s) => [s.rfidUid as string, s]));
      const unknownUids = uids.filter((u) => !byUid.has(u));

      if (inserted.length > 0) {
        const ids = inserted.map((e) => e.id);
        // Mark events resolved (student_id) / processed in one statement.
        await tx.$executeRaw`
          UPDATE rfid_events e
             SET student_id = s.id, processed_at = now()
            FROM students s
           WHERE e.id IN (${Prisma.join(ids)})
             AND s.tenant_id = e.tenant_id
             AND s.rfid_uid = e.rfid_uid
             AND s.deleted_at IS NULL`;
        await tx.$executeRaw`
          UPDATE rfid_events
             SET processed_at = now()
           WHERE id IN (${Prisma.join(ids)}) AND processed_at IS NULL`;
      }

      // 3) Upsert attendance per (student, Kathmandu date) with first/last tap.
      //    Manual marking wins over taps; taps win over system-absent.
      type Agg = { studentDbId: bigint; date: string; first: Date; last: Date };
      const aggs = new Map<string, Agg>();
      for (const ev of inserted) {
        const student = byUid.get(ev.rfidUid);
        if (!student) continue;
        const date = kathmanduDateString(ev.tappedAt);
        const key = `${student.id}|${date}`;
        const cur = aggs.get(key);
        if (!cur) {
          aggs.set(key, {
            studentDbId: student.id,
            date,
            first: ev.tappedAt,
            last: ev.tappedAt,
          });
        } else {
          if (ev.tappedAt < cur.first) cur.first = ev.tappedAt;
          if (ev.tappedAt > cur.last) cur.last = ev.tappedAt;
        }
      }
      if (aggs.size > 0) {
        const rows = [...aggs.values()].map(
          (a) =>
            Prisma.sql`(${randomUUID()}::uuid, ${device.tenantId}, ${a.studentDbId}, ${toDbDate(a.date)}::date, 'present'::"AttendanceStatus", 'rfid'::"AttendanceSource", ${a.first}, ${a.last}, now(), now())`,
        );
        await tx.$executeRaw`
          INSERT INTO attendance_records
            (public_id, tenant_id, student_id, date, status, source, first_tap_at, last_tap_at, created_at, updated_at)
          VALUES ${Prisma.join(rows)}
          ON CONFLICT (tenant_id, student_id, date) DO UPDATE SET
            first_tap_at = LEAST(COALESCE(attendance_records.first_tap_at, EXCLUDED.first_tap_at), EXCLUDED.first_tap_at),
            last_tap_at  = GREATEST(COALESCE(attendance_records.last_tap_at, EXCLUDED.last_tap_at), EXCLUDED.last_tap_at),
            status = CASE WHEN attendance_records.source = 'manual'
                          THEN attendance_records.status
                          ELSE 'present'::"AttendanceStatus" END,
            source = CASE WHEN attendance_records.source = 'manual'
                          THEN 'manual'::"AttendanceSource"
                          ELSE 'rfid'::"AttendanceSource" END,
            updated_at = now()`;
      }

      // 4) Emit rfid.tap domain events (always; per-tap delivery is gated in Phase 5).
      if (inserted.length > 0) {
        await tx.domainEvent.createMany({
          data: inserted.map((ev) => {
            const student = byUid.get(ev.rfidUid);
            return {
              tenantId: device.tenantId,
              type: "rfid.tap",
              payload: {
                studentId: student?.publicId ?? null,
                studentName: student?.name ?? null,
                uid: ev.rfidUid,
                device: device.deviceId,
                location: device.location,
                direction: ev.direction,
                tappedAt: ev.tappedAt.toISOString(),
                date: kathmanduDateString(ev.tappedAt),
              },
            };
          }),
        });
      }

      // 5) Device liveness + the reported-today guard input.
      await tx.rfidDevice.update({
        where: { id: device.id },
        data: {
          lastSeenAt: now,
          ...(swipes.length > 0 ? { lastReportedAt: now } : {}),
        },
      });

      await audit(tx, {
        tenantId: device.tenantId,
        action: "ingest",
        entity: "rfid_events",
        entityId: device.publicId,
        after: {
          batchId: batchId ?? null,
          received: swipes.length,
          inserted: inserted.length,
          duplicates: swipes.length - inserted.length,
          unknownUids,
        },
      });

      return {
        received: swipes.length,
        inserted: inserted.length,
        duplicates: swipes.length - inserted.length,
        resolved: inserted.length - inserted.filter((e) => !byUid.has(e.rfidUid)).length,
        unknownUids,
        attendanceUpserts: aggs.size,
      };
    },
    { timeoutMs: 60_000 },
  );

  return ok(result);
});
