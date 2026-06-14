import { z } from "zod";
import { ApiError, created, handler, ok, parseBody } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { pagination, requireTenantWrite } from "@/lib/tenant";
import { computeSlip } from "@/lib/hr/payroll";

const HR_ROLES = ["school_admin", "principal", "hr_manager"];

const GeneratePayrollSchema = z.object({
  bsYear: z.number().int().min(2070).max(2110),
  bsMonth: z.number().int().min(1).max(12),
  fiscalYear: z.string().min(1).max(20),
  workingDays: z.number().int().min(1).max(32),
});

/** GET /api/hr/payroll — list payroll runs. */
export const GET = handler(async (req: Request) => {
  const { tenantId } = await requireTenantWrite(HR_ROLES);
  const url = new URL(req.url);
  const { page, pageSize, skip } = pagination(url);

  const result = await withTenant(tenantId, async (tx) => {
    const [items, total] = await Promise.all([
      tx.payroll.findMany({
        where: { tenantId },
        orderBy: [{ bsYear: "desc" }, { bsMonth: "desc" }],
        skip,
        take: pageSize,
        include: { _count: { select: { slips: true } } },
      }),
      tx.payroll.count({ where: { tenantId } }),
    ]);
    return { items, total };
  });

  return ok(result.items, { page, pageSize, total: result.total });
});

/** POST /api/hr/payroll — generate payroll for a BS month. */
export const POST = handler(async (req: Request) => {
  const { tenantId, session } = await requireTenantWrite(HR_ROLES);
  const body = await parseBody(req, GeneratePayrollSchema);

  const payroll = await withTenant(tenantId, async (tx) => {
    // Check for duplicate
    const existing = await tx.payroll.findFirst({
      where: { tenantId, bsYear: body.bsYear, bsMonth: body.bsMonth },
    });
    if (existing) {
      throw new ApiError("DUPLICATE", `Payroll for ${body.bsYear}/${body.bsMonth} already exists`, 409);
    }

    // Get all active staff with salary structures
    const staffList = await tx.staff.findMany({
      where: { tenantId, deletedAt: null, status: "active" },
      select: {
        id: true,
        publicId: true,
        name: true,
        salaryStructures: {
          where: { effectiveTo: null },
          take: 1,
          orderBy: { effectiveFrom: "desc" },
        },
        staffAttendance: {
          where: {
            tenantId,
            // We count for the general month — the API caller provides workingDays
          },
          select: { status: true },
        },
      },
    });

    // Filter to staff with salary structures
    const eligible = staffList.filter((s) => s.salaryStructures.length > 0);

    if (eligible.length === 0) {
      throw new ApiError("NO_ELIGIBLE_STAFF", "No staff with salary structures found", 400);
    }

    let totalGross = 0;
    let totalDeduct = 0;
    let totalNet = 0;

    // Create payroll
    const payrollRow = await tx.payroll.create({
      data: {
        tenantId,
        bsYear: body.bsYear,
        bsMonth: body.bsMonth,
        fiscalYear: body.fiscalYear,
        totalGross: 0,
        totalDeduct: 0,
        totalNet: 0,
        staffCount: eligible.length,
        createdBy: session.sub,
      },
    });

    // Create slips
    for (const staff of eligible) {
      const salary = staff.salaryStructures[0];
      const attendance = staff.staffAttendance;

      const presentDays = attendance.filter((a) => a.status === "present" || a.status === "late").length;
      const absentDays = attendance.filter((a) => a.status === "absent").length;
      const leaveDays = attendance.filter((a) => a.status === "leave").length;
      const halfDays = attendance.filter((a) => a.status === "half_day").length;

      const slip = computeSlip(
        {
          basicPaisa: salary.basicPaisa,
          allowancesPaisa: salary.allowancesPaisa,
          deductionsPaisa: salary.deductionsPaisa,
        },
        {
          presentDays,
          absentDays,
          leaveDays,
          halfDays,
          totalWorkingDays: body.workingDays,
        },
      );

      await tx.payrollSlip.create({
        data: {
          tenantId,
          payrollId: payrollRow.id,
          staffId: staff.id,
          basicPaisa: slip.basicPaisa,
          allowancesPaisa: slip.allowancesPaisa,
          deductionsPaisa: slip.deductionsPaisa,
          netPaisa: slip.netPaisa,
          presentDays: slip.presentDays,
          absentDays: slip.absentDays,
          leaveDays: slip.leaveDays,
        },
      });

      totalGross += slip.basicPaisa + slip.allowancesPaisa;
      totalDeduct += slip.deductionsPaisa;
      totalNet += slip.netPaisa;
    }

    // Update totals
    const updated = await tx.payroll.update({
      where: { id: payrollRow.id },
      data: { totalGross, totalDeduct, totalNet },
    });

    await audit(tx, {
      tenantId,
      action: "create",
      entity: "payroll",
      entityId: updated.publicId,
      after: {
        bsYear: body.bsYear,
        bsMonth: body.bsMonth,
        staffCount: eligible.length,
        totalNet,
      },
    });

    return updated;
  });

  return created(payroll);
});
