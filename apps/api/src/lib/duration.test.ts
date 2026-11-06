import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertDurationMinutes,
  monthBounds,
  minutesToDisplayHours,
} from "./duration.js";

test("assertDurationMinutes accepts valid integers", () => {
  assert.equal(assertDurationMinutes(1), 1);
  assert.equal(assertDurationMinutes(60), 60);
  assert.equal(assertDurationMinutes(1440), 1440);
});

test("assertDurationMinutes rejects invalid values", () => {
  assert.throws(() => assertDurationMinutes(0));
  assert.throws(() => assertDurationMinutes(-5));
  assert.throws(() => assertDurationMinutes(1441));
  assert.throws(() => assertDurationMinutes(30.5));
  assert.throws(() => assertDurationMinutes("60"));
});

test("monthBounds uses inclusive start and exclusive next month", () => {
  assert.deepEqual(monthBounds("2026-01"), {
    start: "2026-01-01",
    endExclusive: "2026-02-01",
  });
  assert.deepEqual(monthBounds("2026-12"), {
    start: "2026-12-01",
    endExclusive: "2027-01-01",
  });
});

test("minutesToDisplayHours is presentation-only division", () => {
  assert.equal(minutesToDisplayHours(90), 1.5);
});
