import { z } from "zod";
import { ApiError, handler, ok, created, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite, requireTenantSession, pagination } from "@/lib/tenant";

const createSchema = z.object({
  sectionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  titleNe: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  descriptionNe: z.string().max(5000).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  publishNow: z.boolean().default(true),
});

export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantSession();
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);
  const sectionPub = url.searchParams.get("section");
  const subjectPub = url.searchParams.get("subject");

  const result = await withTenant(tenantId, async (tx) => {
    const where: Record<string, unknown> = { tenantId, deletedAt: null };

    if (sectionPub) {
      const sec = await tx.section.findFirst({ where: { tenantId, publicId: sectionPub, deletedAt: null }, select: { id: true } });
      if (!sec) return { items: [], total: 0 };
      where.sectionId = sec.id;
    }
    if (subjectPub) {
      const sub = await tx.subject.findFirst({ where: { tenantId, publicId: subjectPub, deletedAt: null }, select: { id: true } });
      if (!sub) return { items: [], total: 0 };
      where.subjectId = sub.id;
    }

    const [items, total] = await Promise.all([
      tx.homework.findMany({
        where,
        orderBy: { dueDate: "desc" },
        skip,
        take: pageSize,
        include: {
          section: { select: { publicId: true, name: true, class: { select: { publicId: true, name: true } } } },
          subject: { select: { publicId: true, name: true, nameNe: true } },
          staff: { select: { publicId: true, name: true } },
          _count: { select: { submissions: true } },
        },
      }),
      tx.homework.count({ where }),
    ]);
    return { items, total };
  });

  return ok(result.items, { page, pageSize, total: result.total });
});

export const POST = handler(async (req: Request) => {
  const { tenantId, session } = await requireTenantWrite(["school_admin", "principal", "teacher", "class_teacher"]);
  const body = await parseBody(req, createSchema);

  const hw = await withTenant(tenantId, async (tx) => {
    const [section, subject] = await Promise.all([
      tx.section.findFirst({ where: { tenantId, publicId: body.sectionId, deletedAt: null }, select: { id: true } }),
      tx.subject.findFirst({ where: { tenantId, publicId: body.subjectId, deletedAt: null }, select: { id: true } }),
    ]);
    if (!section) throw new ApiError("SECTION_NOT_FOUND", "Section not found", 404);
    if (!subject) throw new ApiError("SUBJECT_NOT_FOUND", "Subject not found", 404);

    // Resolve staff from session
    const user = await tx.user.findFirst({ where: { publicId: session.sub }, select: { id: true } });
    const staff = user
      ? await tx.staff.findFirst({ where: { tenantId, userId: user.id, deletedAt: null }, select: { id: true } })
      : null;
    const staffId = staff?.id ?? (await tx.staff.findFirst({ where: { tenantId, deletedAt: null }, select: { id: true } }))?.id;
    if (!staffId) throw new Error("No staff record found");

    const h = await tx.homework.create({
      data: {
        tenantId,
        sectionId: section.id,
        subjectId: subject.id,
        staffId,
        title: body.title,
        titleNe: body.titleNe ?? null,
        description: body.description ?? null,
        descriptionNe: body.descriptionNe ?? null,
        dueDate: new Date(body.dueDate),
        publishedAt: body.publishNow ? new Date() : null,
      },
      include: {
        section: { select: { publicId: true, name: true, class: { select: { name: true } } } },
        subject: { select: { publicId: true, name: true } },
        staff: { select: { publicId: true, name: true } },
      },
    });

    if (body.publishNow) {
      await tx.domainEvent.create({
        data: {
          tenantId,
          type: "homework.assigned",
          payload: {
            homeworkId: h.publicId,
            title: h.title,
            sectionId: body.sectionId,
            dueDate: body.dueDate,
          },
        },
      });
    }

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "homework",
      entityId: h.publicId,
      after: { title: h.title, sectionId: body.sectionId, dueDate: body.dueDate },
    });

    return h;
  });

  return created(hw);
});
