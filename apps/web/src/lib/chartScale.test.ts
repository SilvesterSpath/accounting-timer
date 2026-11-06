import assert from "node:assert/strict";
import { test } from "node:test";
import { hourAxisTicks, niceHoursCeiling } from "./chartScale.js";

test("niceHoursCeiling rounds up to a readable scale", () => {
  assert.equal(niceHoursCeiling(0), 1);
  assert.equal(niceHoursCeiling(1.5), 4); // 1*4
  assert.equal(niceHoursCeiling(80), 100);
  assert.equal(niceHoursCeiling(100), 100);
});

test("hourAxisTicks returns four ascending marks", () => {
  assert.deepEqual(hourAxisTicks(80), [25, 50, 75, 100]);
});
