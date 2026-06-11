import { handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { authenticateDevice } from "@/lib/rfid-auth";

/**
 * GET /api/rfid/mappings — card↔student mapping sync for readers (§7.3).
 *
 * Devices cache this locally so they can resolve a tap to a student name
 * (LED/voice/display feedback) while offline. Device-authenticated:
 *   x-device-id, x-timestamp (ISO, ±10 min), x-signature = HMAC(secret, x-timestamp)
 */
export const GET = handler(async (req: Request) => {
  const ts = req.headers.get("x-timestamp") ?? "";
  const device = await authenticateDevice(req, ts, { requireTimestamp: true });

  const mappings = await withTenant(device.tenantId, async (tx) => {
    const students = await tx.student.findMany({
      where: {
        tenantId: device.tenantId,
        rfidUid: { not: null },
        status: "active",
        deletedAt: null,
      },
      select: {
        rfidUid: true,
        name: true,
        nameNe: true,
        admissionNo: true,
        enrollments: {
          where: { deletedAt: null, academicYear: { isCurrent: true } },
          select: {
            rollNo: true,
            section: { select: { name: true, class: { select: { name: true } } } },
          },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });

    await tx.rfidDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });

    return students.map((s) => {
      const e = s.enrollments[0];
      return {
        uid: s.rfidUid,
        name: s.name,
        nameNe: s.nameNe,
        admissionNo: s.admissionNo,
        class: e?.section.class.name ?? null,
        section: e?.section.name ?? null,
        rollNo: e?.rollNo ?? null,
      };
    });
  });

  return ok({ generatedAt: new Date().toISOString(), count: mappings.length, mappings });
});
