import assert from "node:assert/strict";
import { test } from "node:test";
import {
  employeeOptionLabel,
  isValidWorkDate,
  reportingMonthFromWorkDate,
  resolveLatestWorkbenchPayload,
  selectDisplayedSheet,
  sheetMatchesSelection,
  shouldApplyWorkbenchResult,
  tryReportingMonthFromWorkDate,
  workbenchScopeKey,
  type WorkbenchSheetPayload,
} from "./workbenchScope.js";

function sampleSheet(
  scopeKey: string,
  totalMinutes: number,
): WorkbenchSheetPayload<Array<{ id: string }>, { totalMinutes: number }> {
  const [employeeId, workDate] = scopeKey.split("|");
  return {
    scopeKey,
    workDate: workDate ?? "",
    reportingMonth: (workDate ?? "").slice(0, 7),
    employeeId: employeeId || null,
    entries: [{ id: `${scopeKey}-entry` }],
    daily: { totalMinutes },
    monthly: { totalMinutes },
    managementMonthly: null,
  };
}

test("isValidWorkDate accepts complete calendar dates only", () => {
  assert.equal(isValidWorkDate("2026-04-10"), true);
  assert.equal(isValidWorkDate(""), false);
  assert.equal(isValidWorkDate("2026-04"), false);
  assert.equal(isValidWorkDate("2026-04-3"), false);
  assert.equal(isValidWorkDate("2026-02-31"), false);
  assert.equal(isValidWorkDate("not-a-date"), false);
});

test("clearing the date input does not throw and hides sheet display", () => {
  assert.equal(tryReportingMonthFromWorkDate(""), null);
  assert.equal(tryReportingMonthFromWorkDate("2026-04"), null);
  assert.doesNotThrow(() => tryReportingMonthFromWorkDate(""));
  assert.throws(() => reportingMonthFromWorkDate(""), /Invalid workDate/);

  const prior = sampleSheet("emp-a|2026-04-10", 45);
  const displayed = selectDisplayedSheet({
    selection: { employeeId: "emp-a", workDate: "" },
    result: prior,
  });
  assert.equal(displayed, null);
});

test("reportingMonthFromWorkDate derives YYYY-MM from selected date", () => {
  assert.equal(reportingMonthFromWorkDate("2026-03-15"), "2026-03");
  assert.equal(reportingMonthFromWorkDate("2025-12-01"), "2025-12");
});

test("workbenchScopeKey binds employee and reporting date", () => {
  assert.equal(
    workbenchScopeKey({ employeeId: "emp-a", workDate: "2026-04-10" }),
    "emp-a|2026-04-10",
  );
});

test("shouldApplyWorkbenchResult rejects stale sequence or mismatched key", () => {
  assert.equal(
    shouldApplyWorkbenchResult({
      activeKey: "a|2026-04-10",
      resultKey: "a|2026-04-10",
      activeSeq: 3,
      resultSeq: 3,
    }),
    true,
  );
  assert.equal(
    shouldApplyWorkbenchResult({
      activeKey: "b|2026-04-10",
      resultKey: "a|2026-04-10",
      activeSeq: 3,
      resultSeq: 2,
    }),
    false,
  );
});

test("sheetMatchesSelection requires exact employee+date binding", () => {
  assert.equal(
    sheetMatchesSelection("emp-a|2026-04-10", "emp-a|2026-04-10"),
    true,
  );
  assert.equal(
    sheetMatchesSelection("emp-a|2026-04-10", "emp-b|2026-04-10"),
    false,
  );
  assert.equal(sheetMatchesSelection(null, "emp-a|2026-04-10"), false);
});

test("rapid employee switching never shows prior employee figures", () => {
  const resultA = sampleSheet("emp-a|2026-04-10", 45);
  assert.equal(
    selectDisplayedSheet({
      selection: { employeeId: "emp-b", workDate: "2026-04-10" },
      result: resultA,
    }),
    null,
  );

  const resultB = sampleSheet("emp-b|2026-04-10", 120);
  const shown = selectDisplayedSheet({
    selection: { employeeId: "emp-b", workDate: "2026-04-10" },
    result: resultB,
  });
  assert.equal(shown?.daily.totalMinutes, 120);
  assert.equal(shown?.scopeKey, "emp-b|2026-04-10");
});

test("out-of-order API responses stay bound to their request scope", async () => {
  let releaseSlow: (() => void) | undefined;
  const slowReady = new Promise<void>((resolve) => {
    releaseSlow = resolve;
  });

  const appliedPromise = resolveLatestWorkbenchPayload({
    requests: [
      {
        key: "emp-a|2026-04-10",
        run: async () => {
          await slowReady;
          return sampleSheet("emp-a|2026-04-10", 45);
        },
      },
      {
        key: "emp-b|2026-05-01",
        run: async () => {
          await new Promise((r) => setTimeout(r, 5));
          return sampleSheet("emp-b|2026-05-01", 120);
        },
      },
    ],
  });

  await new Promise((r) => setTimeout(r, 20));
  releaseSlow?.();

  const applied = await appliedPromise;
  assert.equal(applied.key, "emp-b|2026-05-01");
  assert.equal(
    selectDisplayedSheet({
      selection: { employeeId: "emp-b", workDate: "2026-05-01" },
      result: applied.value,
    })?.daily.totalMinutes,
    120,
  );
  assert.equal(
    selectDisplayedSheet({
      selection: { employeeId: "emp-a", workDate: "2026-04-10" },
      result: applied.value,
    }),
    null,
  );
});

test("failed request after changing employee clears display for new selection", async () => {
  const prior = sampleSheet("emp-a|2026-04-10", 45);
  await assert.rejects(async () => {
    await resolveLatestWorkbenchPayload({
      requests: [
        {
          key: "emp-b|2026-04-10",
          run: async () => {
            throw new Error("network failed");
          },
        },
      ],
    });
  }, /network failed/);

  assert.equal(
    selectDisplayedSheet({
      selection: { employeeId: "emp-b", workDate: "2026-04-10" },
      result: prior,
    }),
    null,
  );
  assert.equal(
    selectDisplayedSheet({
      selection: { employeeId: "emp-b", workDate: "2026-04-10" },
      result: null,
    }),
    null,
  );
});

test("selecting dates in different months rebinds month totals", () => {
  const april = sampleSheet("emp-a|2026-04-10", 45);
  const maySelection = { employeeId: "emp-a", workDate: "2026-05-02" };
  assert.equal(
    selectDisplayedSheet({ selection: maySelection, result: april }),
    null,
  );
  assert.equal(tryReportingMonthFromWorkDate("2026-05-02"), "2026-05");
  assert.notEqual(
    workbenchScopeKey({ employeeId: "emp-a", workDate: "2026-04-10" }),
    workbenchScopeKey(maySelection),
  );
});

test("employeeOptionLabel marks inactive and self", () => {
  assert.equal(
    employeeOptionLabel({
      displayName: "Disabled User",
      email: "disabled@example.com",
      active: false,
      isSelf: false,
    }),
    "Disabled User (disabled@example.com) — inaktív",
  );
});
