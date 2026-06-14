import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { pagination, requireTenantWrite } from "@/lib/tenant";

const CreateAssignmentSchema = z.object({
  studentId: z.string().uuid(),
  routeId: z.string().uuid(),
  stopId: z.string().uuid(),
  monthlyFeePaisa: z.number().int().min(0).optional(),
});

/** GET /api/transport/assignments — list assignments, paginated, filterable. */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(["school_admin", "principal", "transport"]);
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);

  const routePid = url.searchParams.get("routeId") || undefined;
  const classPid = url.searchParams.get("classId") || undefined;
  if (routePid) z.uuid().parse(routePid);
  if (classPid) z.uuid().parse(classPid);

  const result = await withTenant(tenantId, async (tx) => {
    const where: Prisma.TransportAssignmentWhereInput = {
      tenantId,
      isActive: true,
    };

    if (routePid) {
      const route = await tx.transportRoute.findFirst({
        where: { tenantId, publicId: routePid, deletedAt: null },
        select: { id: true },
      });
      if (!route) throw new ApiError("NOT_FOUND", "Route not found", 404);
      where.routeId = route.id;
    }

    if (classPid) {
      const cls = await tx.schoolClass.findFirst({
        where: { tenantId, publicId: classPid, deletedAt: null },
        include: { sections: { where: { deletedAt: null }, select: { id: true } } },
      });
      if (!cls) throw new ApiError("NOT_FOUND", "Class not found", 404);
      const sectionIds = cls.sections.map((s) => s.id);
      where.student = {
        enrollments: {
          some: {
            deletedAt: null,
            sectionId: { in: sectionIds },
            academicYear: { isCurrent: true },
          },
        },
      };
    }

    const [rows, total] = await Promise.all([
      tx.transportAssignment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          student: {
            select: {
              publicId: true,
              name: true,
              nameNe: true,
              enrollments: {
                where: { deletedAt: null, academicYear: { isCurrent: true } },
                take: 1,
                select: {
                  section: {
                    select: {
                      publicId: true,
                      name: true,
                      class: { select: { publicId: true, name: true } },
                    },
                  },
                },
              },
            },
          },
          route: {
            select: { publicId: true, name: true, vehicleNo: true },
          },
          stop: {
            select: { publicId: true, name: true, pickupTime: true, dropTime: true },
          },
        },
      }),
      tx.transportAssignment.count({ where }),
    ]);

    return { rows, total };
  });

  return ok(result.rows, { page, pageSize, total: result.total });
});

/** POST /api/transport/assignments — assign a student to a route + stop. */
export const POST = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(["school_admin", "transport"]);
  const body = await parseBody(req, CreateAssignmentSchema);

  const assignment = await withTenant(tenantId, async (tx) => {
    // Validate current academic year
    const year = await tx.academicYear.findFirst({
      where: { tenantId, isCurrent: true, deletedAt: null },
      select: { id: true, publicId: true },
    });
    if (!year) throw new ApiError("NO_ACADEMIC_YEAR", "No current academic year", 400);

    // Validate student
    const student = await tx.student.findFirst({
      where: { tenantId, publicId: body.studentId, deletedAt: null },
      select: { id: true, publicId: true, name: true },
    });
    if (!student) throw new ApiError("NOT_FOUND", "Student not found", 404);

    // Validate route
    const route = await tx.transportRoute.findFirst({
      where: { tenantId, publicId: body.routeId, deletedAt: null },
      select: { id: true, publicId: true, name: true },
    });
    if (!route) throw new ApiError("NOT_FOUND", "Route not found", 404);

    // Validate stop belongs to route
    const stop = await tx.transportStop.findFirst({
      where: { tenantId, publicId: body.stopId, routeId: route.id },
      select: { id: true, publicId: true, name: true },
    });
    if (!stop)
      throw new ApiError(
        "STOP_NOT_ON_ROUTE",
        "Stop does not belong to the specified route",
        400,
      );

    // One assignment per student per academic year
    const existing = await tx.transportAssignment.findFirst({
      where: { tenantId, studentId: student.id, academicYearId: year.id },
      select: { id: true },
    });
    if (existing)
      throw new ApiError(
        "ALREADY_ASSIGNED",
        "Student is already assigned to a transport route for this academic year",
        409,
      );

    const row = await tx.transportAssignment.create({
      data: {
        tenantId,
        studentId: student.id,
        routeId: route.id,
        stopId: stop.id,
        academicYearId: year.id,
        monthlyFeePaisa: body.monthlyFeePaisa,
      },
    });

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "transport_assignments",
      entityId: row.publicId,
      after: {
        studentId: student.publicId,
        routeId: route.publicId,
        stopId: stop.publicId,
        monthlyFeePaisa: row.monthlyFeePaisa,
      },
    });

    return row;
  });

  return created(assignment);
});
