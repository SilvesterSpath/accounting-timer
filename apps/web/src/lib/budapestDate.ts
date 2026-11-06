const BUDAPEST = "Europe/Budapest";

/** Calendar date YYYY-MM-DD in Europe/Budapest for the given instant. */
export function budapestCalendarDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUDAPEST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Failed to format Budapest calendar date");
  }
  return `${year}-${month}-${day}`;
}

/** Calendar month YYYY-MM in Europe/Budapest for the given instant. */
export function budapestCalendarMonth(now: Date = new Date()): string {
  return budapestCalendarDate(now).slice(0, 7);
}
