import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isValidReportingMonth,
  selectDisplayedDashboard,
  shouldApplyDashboardResult,
} from "./dashboardScope.js";

test("isValidReportingMonth accepts YYYY-MM only", () => {
  assert.equal(isValidReportingMonth("2026-04"), true);
  assert.equal(isValidReportingMonth(""), false);
  assert.equal(isValidReportingMonth("2026-13"), false);
});

test("month switching never shows a prior month payload", () => {
  const prior = { month: "2026-03", totalMinutes: 120 };
  assert.equal(
    selectDisplayedDashboard({
      selectedMonth: "2026-04",
      result: prior,
    }),
    null,
  );
  assert.deepEqual(
    selectDisplayedDashboard({
      selectedMonth: "2026-03",
      result: prior,
    }),
    prior,
  );
});

test("stale-response sequence rejects outdated completions", () => {
  assert.equal(
    shouldApplyDashboardResult({
      activeMonth: "2026-05",
      resultMonth: "2026-04",
      activeSeq: 2,
      resultSeq: 1,
    }),
    false,
  );
  assert.equal(
    shouldApplyDashboardResult({
      activeMonth: "2026-05",
      resultMonth: "2026-05",
      activeSeq: 2,
      resultSeq: 2,
    }),
    true,
  );
});
