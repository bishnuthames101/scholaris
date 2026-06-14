export function calculateFine(dueAt: Date, returnedAt: Date, finePerDayPaisa: number): number {
  const diffMs = returnedAt.getTime() - dueAt.getTime();
  const overdueDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  return overdueDays * finePerDayPaisa;
}
