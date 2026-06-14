export type AttendanceSummary = {
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  halfDays: number;
  totalWorkingDays: number;
};

export type SalaryInput = {
  basicPaisa: number;
  allowancesPaisa: number;
  deductionsPaisa: number;
};

export type SlipResult = {
  basicPaisa: number;
  allowancesPaisa: number;
  deductionsPaisa: number;
  netPaisa: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
};

/**
 * Compute a payroll slip from salary structure and attendance summary.
 * Pro-rates basic salary by attendance ratio when absent days > 0.
 * All monetary values are in integer paisa.
 */
export function computeSlip(
  salary: SalaryInput,
  attendance: AttendanceSummary,
): SlipResult {
  const effectiveDays =
    attendance.presentDays +
    attendance.leaveDays +
    attendance.halfDays * 0.5;
  const ratio =
    attendance.totalWorkingDays > 0
      ? effectiveDays / attendance.totalWorkingDays
      : 1;
  const proratedBasic = Math.round(salary.basicPaisa * ratio);
  const gross = proratedBasic + salary.allowancesPaisa;
  const net = gross - salary.deductionsPaisa;

  return {
    basicPaisa: proratedBasic,
    allowancesPaisa: salary.allowancesPaisa,
    deductionsPaisa: salary.deductionsPaisa,
    netPaisa: Math.max(0, net),
    presentDays: attendance.presentDays,
    absentDays: attendance.absentDays,
    leaveDays: attendance.leaveDays,
  };
}
