import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatHuDate,
  formatHuHours,
  formatHuInteger,
  formatHuMonth,
} from "./huFormat.js";

test("formatHuInteger uses Hungarian grouping", () => {
  const formatted = formatHuInteger(1250);
  assert.match(formatted, /1/);
  assert.match(formatted, /250/);
});

test("formatHuHours keeps two fraction digits in hu-HU", () => {
  const formatted = formatHuHours(1.5);
  assert.match(formatted, /1/);
  assert.match(formatted, /5/);
});

test("formatHuDate formats calendar days without changing the value", () => {
  const formatted = formatHuDate("2026-04-10");
  assert.match(formatted, /2026/);
  assert.match(formatted, /04|4/);
  assert.match(formatted, /10/);
});

test("formatHuMonth formats reporting month labels", () => {
  const formatted = formatHuMonth("2026-05");
  assert.match(formatted, /2026/);
  assert.match(formatted, /május|Május/i);
});
