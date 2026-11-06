/** Build a simple nice upper bound and tick marks for hour-based charts. */

export function niceHoursCeiling(maxHours: number): number {
  if (!Number.isFinite(maxHours) || maxHours <= 0) return 1;
  const stepCandidates = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
  for (const step of stepCandidates) {
    const steps = 4;
    const ceiling = step * steps;
    if (maxHours <= ceiling) return ceiling;
  }
  return Math.ceil(maxHours / 100) * 100;
}

export function hourAxisTicks(maxHours: number): number[] {
  const ceiling = niceHoursCeiling(maxHours);
  const step = ceiling / 4;
  return [step, step * 2, step * 3, ceiling];
}
