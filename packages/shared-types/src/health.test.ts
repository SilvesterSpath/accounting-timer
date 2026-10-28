import assert from "node:assert/strict";
import { test } from "node:test";
import type { HealthResponse } from "./index.js";

test("HealthResponse shape is assignable", () => {
  const sample: HealthResponse = {
    status: "ok",
    service: "api",
    timestamp: new Date().toISOString(),
    database: "up",
    node: process.version,
  };
  assert.equal(sample.service, "api");
});
