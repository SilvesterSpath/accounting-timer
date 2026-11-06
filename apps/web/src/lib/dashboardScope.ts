/**
 * Pure helpers for management dashboard loading / stale-response gating.
 */

export function isValidReportingMonth(month: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(month)) return false;
  const monthNum = Number(month.slice(5, 7));
  return monthNum >= 1 && monthNum <= 12;
}

export function shouldApplyDashboardResult(input: {
  activeMonth: string;
  resultMonth: string;
  activeSeq: number;
  resultSeq: number;
}): boolean {
  return (
    input.activeSeq === input.resultSeq &&
    input.activeMonth === input.resultMonth
  );
}

export function selectDisplayedDashboard<T extends { month: string }>(input: {
  selectedMonth: string;
  result: T | null;
}): T | null {
  if (!isValidReportingMonth(input.selectedMonth)) return null;
  if (!input.result) return null;
  if (input.result.month !== input.selectedMonth) return null;
  return input.result;
}
