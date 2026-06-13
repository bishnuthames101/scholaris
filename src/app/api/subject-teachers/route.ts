import { z } from "zod";
import { ApiError, handler, ok, created, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { requireTenantSession, requireTenantWrite, pagination } from "@/lib/tenant";

const assignSchema = z.object({
  subjectId: z.string().uuid(),
  sectionId: z.string().uuid(),
  staffId: z.string().uuid(),
});

export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);
  const sectionId = url.searchParams.get("section");
  const staffId = url.searchParams.get("staff");

  const result = await withTenant(tenantId, async (tx) => {
    const where: Record<string, unknown> = { tenantId };
    if (sectionId) {
      const sec = await tx.section.findFirst({ where: { tenantId, publicId: sectionId, deletedAt: null }, select: { id: true } });
      if (!sec) return { items: [], total: 0 };
      where.sectionId = sec.id;
    }
    if (staffId) {
      const s = await tx.staff.findFirst({ where: { tenantId, publicId: staffId, deletedAt: null }, select: { id: true } });
      if (!s) return { items: [], total: 0 };
      where.staffId = s.id;
    }

    const [items, total] = await Promise.all([
      tx.subjectTeacher.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          subject: { select: { publicId: true, name: true, nameNe: true, code: true } },
          section: { select: { publicId: true, name: true, class: { select: { publicId: true, name: true } } } },
          staff: { select: { publicId: true, name: true, nameNe: true } },
        },
      }),
      tx.subjectTeacher.count({ where }),
    ]);
    return { items, total };
  });

  return ok(result.items, { page, pageSize, total: result.total });
});

export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite();
  const body = await parseBody(req, assignSchema);

  const item = await withTenant(tenantId, async (tx) => {
    const [subject, section, staff] = await Promise.all([
      tx.subject.findFirst({ where: { tenantId, publicId: body.subjectId, deletedAt: null }, select: { id: true } }),
      tx.section.findFirst({ where: { tenantId, publicId: body.sectionId, deletedAt: null }, select: { id: true } }),
      tx.staff.findFirst({ where: { tenantId, publicId: body.staffId, deletedAt: null }, select: { id: true } }),
    ]);
    if (!subject) throw new ApiError("SUBJECT_NOT_FOUND", "Subject not found", 404);
    if (!section) throw new ApiError("SECTION_NOT_FOUND", "Section not found", 404);
    if (!staff) throw new ApiError("STAFF_NOT_FOUND", "Staff not found", 404);

    return tx.subjectTeacher.upsert({
      where: { tenantId_subjectId_sectionId: { tenantId, subjectId: subject.id, sectionId: section.id } },
      update: { staffId: staff.id },
      create: { tenantId, subjectId: subject.id, sectionId: section.id, staffId: staff.id },
      include: {
        subject: { select: { publicId: true, name: true } },
        section: { select: { publicId: true, name: true } },
        staff: { select: { publicId: true, name: true } },
      },
    });
  });

  return created(item);
});
