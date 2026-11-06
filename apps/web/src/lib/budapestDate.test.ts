import assert from "node:assert/strict";
import { test } from "node:test";
import { budapestCalendarDate, budapestCalendarMonth } from "./budapestDate.js";

test("Budapest date stays on prior day while UTC has already rolled", () => {
  // 2026-03-15 00:30 UTC == 2026-03-15 01:30 Budapest (CET, UTC+1) → same calendar day
  assert.equal(
    budapestCalendarDate(new Date("2026-03-15T00:30:00.000Z")),
    "2026-03-15",
  );

  // 2026-03-14 23:30 UTC == 2026-03-15 00:30 Budapest → Budapest already next day
  assert.equal(
    budapestCalendarDate(new Date("2026-03-14T23:30:00.000Z")),
    "2026-03-15",
  );

  // 2026-03-14 22:30 UTC == 2026-03-14 23:30 Budapest → still 14th in Budapest
  assert.equal(
    budapestCalendarDate(new Date("2026-03-14T22:30:00.000Z")),
    "2026-03-14",
  );
});

test("Budapest month rolls at local midnight across year boundary", () => {
  // New Year's Eve evening UTC still Dec 31 in Budapest
  assert.equal(
    budapestCalendarMonth(new Date("2025-12-31T21:00:00.000Z")),
    "2025-12",
  );
  // 2025-12-31 23:30 UTC == 2026-01-01 00:30 Budapest
  assert.equal(
    budapestCalendarMonth(new Date("2025-12-31T23:30:00.000Z")),
    "2026-01",
  );
  assert.equal(
    budapestCalendarDate(new Date("2025-12-31T23:30:00.000Z")),
    "2026-01-01",
  );
});

test("summer time (CEST UTC+2) midnight transition", () => {
  // 2026-07-01 21:30 UTC == 2026-07-01 23:30 Budapest
  assert.equal(
    budapestCalendarDate(new Date("2026-07-01T21:30:00.000Z")),
    "2026-07-01",
  );
  // 2026-07-01 22:30 UTC == 2026-07-02 00:30 Budapest
  assert.equal(
    budapestCalendarDate(new Date("2026-07-01T22:30:00.000Z")),
    "2026-07-02",
  );
});
