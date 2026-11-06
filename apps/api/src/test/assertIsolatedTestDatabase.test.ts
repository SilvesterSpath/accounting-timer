import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertIsolatedTestDatabaseUrl,
  isIsolatedTestDatabaseUrl,
  UnsafeTestDatabaseError,
} from "./assertIsolatedTestDatabase.js";

const OK =
  "postgresql://accounting:accounting@127.0.0.1:5433/accounting_timer_test";

test("accepts disposable loopback test database URL", () => {
  assert.doesNotThrow(() => assertIsolatedTestDatabaseUrl(OK));
  assert.equal(isIsolatedTestDatabaseUrl(OK), true);
  assert.equal(
    isIsolatedTestDatabaseUrl(
      "postgresql://accounting:accounting@localhost:5433/accounting_timer_test",
    ),
    true,
  );
});

test("rejects development database on :5432", () => {
  assert.throws(
    () =>
      assertIsolatedTestDatabaseUrl(
        "postgresql://accounting:accounting@127.0.0.1:5432/accounting_timer",
      ),
    UnsafeTestDatabaseError,
  );
});

test("rejects production-looking remote hosts", () => {
  assert.throws(
    () =>
      assertIsolatedTestDatabaseUrl(
        "postgresql://u:p@db.example.com:5433/accounting_timer_test",
      ),
    /loopback/,
  );
});

test("rejects staging/prod database names even on loopback:5433", () => {
  assert.throws(
    () =>
      assertIsolatedTestDatabaseUrl(
        "postgresql://accounting:accounting@127.0.0.1:5433/accounting_timer",
      ),
    /dev\/system DB|must be/,
  );
  assert.throws(
    () =>
      assertIsolatedTestDatabaseUrl(
        "postgresql://accounting:accounting@127.0.0.1:5433/accounting_timer_staging",
      ),
    UnsafeTestDatabaseError,
  );
  assert.throws(
    () =>
      assertIsolatedTestDatabaseUrl(
        "postgresql://accounting:accounting@127.0.0.1:5433/accounting_timer_production",
      ),
    UnsafeTestDatabaseError,
  );
});
