/**
 * Pure helpers for operator timesheet workbench loading.
 * Keep selection keys and stale-response gating out of React components.
 */

export type WorkbenchScope = {
  employeeId: string | null;
  workDate: string;
};

export type WorkbenchSheetPayload<TEntries, TSummary> = {
  scopeKey: string;
  workDate: string;
  reportingMonth: string;
  employeeId: string | null;
  entries: TEntries;
  daily: TSummary;
  monthly: TSummary;
  managementMonthly: TSummary | null;
};

const WORK_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidWorkDate(value: string): boolean {
  if (!WORK_DATE_RE.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Reject clearly impossible calendar dates (e.g. 2026-02-31).
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function reportingMonthFromWorkDate(workDate: string): string {
  if (!isValidWorkDate(workDate)) {
    throw new Error(`Invalid workDate: ${workDate}`);
  }
  return workDate.slice(0, 7);
}

/** Safe month derivation for UI; returns null while the date field is empty/invalid. */
export function tryReportingMonthFromWorkDate(workDate: string): string | null {
  return isValidWorkDate(workDate) ? workDate.slice(0, 7) : null;
}

export function workbenchScopeKey(scope: WorkbenchScope): string {
  return `${scope.employeeId ?? ""}|${scope.workDate}`;
}

export function shouldApplyWorkbenchResult(input: {
  activeKey: string;
  resultKey: string;
  activeSeq: number;
  resultSeq: number;
}): boolean {
  return (
    input.activeSeq === input.resultSeq && input.activeKey === input.resultKey
  );
}

/** True only when a loaded payload belongs to the exact current selection. */
export function sheetMatchesSelection(
  resultScopeKey: string | null | undefined,
  selectionScopeKey: string,
): boolean {
  return (
    typeof resultScopeKey === "string" &&
    resultScopeKey.length > 0 &&
    resultScopeKey === selectionScopeKey
  );
}

/**
 * Decide whether the workbench may show totals/entries for the current selection.
 * Invalid dates never display previously loaded figures.
 */
export function selectDisplayedSheet<TEntries, TSummary>(input: {
  selection: WorkbenchScope;
  result: WorkbenchSheetPayload<TEntries, TSummary> | null;
}): WorkbenchSheetPayload<TEntries, TSummary> | null {
  if (!isValidWorkDate(input.selection.workDate)) return null;
  if (!input.result) return null;
  const selectionKey = workbenchScopeKey(input.selection);
  if (!sheetMatchesSelection(input.result.scopeKey, selectionKey)) return null;
  return input.result;
}

export function employeeOptionLabel(input: {
  displayName: string;
  email: string | null;
  active: boolean;
  isSelf: boolean;
}): string {
  const parts = [input.displayName];
  if (input.email) parts.push(`(${input.email})`);
  if (!input.active) parts.push("— inactive");
  if (input.isSelf) parts.push("— you");
  return parts.join(" ");
}

/**
 * Simulates rapid selection changes. The last request in the array is the
 * latest user selection; earlier completions are ignored even if they finish later.
 */
export async function resolveLatestWorkbenchPayload<T>(input: {
  requests: Array<{ key: string; run: () => Promise<T> }>;
}): Promise<{ key: string; value: T }> {
  const latestSeq = input.requests.length;
  if (latestSeq === 0) {
    throw new Error("No workbench requests");
  }

  let applied: { key: string; value: T } | null = null;
  let latestError: unknown;

  await Promise.all(
    input.requests.map(async (request, index) => {
      const resultSeq = index + 1;
      try {
        const value = await request.run();
        if (
          shouldApplyWorkbenchResult({
            activeKey: input.requests[latestSeq - 1]!.key,
            resultKey: request.key,
            activeSeq: latestSeq,
            resultSeq,
          })
        ) {
          applied = { key: request.key, value };
        }
      } catch (err) {
        if (resultSeq === latestSeq) {
          latestError = err;
        }
      }
    }),
  );

  if (latestError) {
    throw latestError;
  }
  if (!applied) {
    throw new Error("Latest workbench request produced no payload");
  }
  return applied;
}
