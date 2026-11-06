/** Display helpers for Hungarian locale — values stay unchanged underneath. */

export function formatHuInteger(value: number): string {
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 }).format(
    value,
  );
}

export function formatHuHours(value: number): string {
  return new Intl.NumberFormat("hu-HU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Format a YYYY-MM-DD calendar date for Hungarian display (Europe/Budapest). */
export function formatHuDate(workDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return workDate;
  const [yearText, monthText, dayText] = workDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  // Noon UTC avoids DST edge flips when labeling a pure calendar day.
  const instant = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("hu-HU", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function formatHuMonth(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const [yearText, monthText] = month.split("-");
  const instant = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, 1, 12));
  return new Intl.DateTimeFormat("hu-HU", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "long",
  }).format(instant);
}
