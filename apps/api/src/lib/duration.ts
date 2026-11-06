/** Prototype cap: duration must be > 0 and <= 24 hours in minutes. */
export const MAX_DURATION_MINUTES = 24 * 60;

export function assertDurationMinutes(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("durationMinutes must be an integer");
  }
  if (value <= 0 || value > MAX_DURATION_MINUTES) {
    throw new Error(
      `durationMinutes must be between 1 and ${MAX_DURATION_MINUTES}`,
    );
  }
  return value;
}

/** Inclusive YYYY-MM-01 → exclusive next month (calendar month, work_date based). */
export function monthBounds(yearMonth: string): {
  start: string;
  endExclusive: string;
} {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) {
    throw new Error("month must be YYYY-MM");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error("month must be YYYY-MM");
  }
  const start = `${match[1]}-${match[2]}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endExclusive = `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, endExclusive };
}

export function minutesToDisplayHours(minutes: number): number {
  return minutes / 60;
}
