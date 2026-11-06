import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CORS_ORIGINS, parseCorsOrigins, resolveJwtSecret } from "./config.js";

test("default CORS includes canonical app origin exactly once", () => {
  const origins = parseCorsOrigins({});
  assert.deepEqual(origins, [...DEFAULT_CORS_ORIGINS]);
  assert.ok(origins.includes("app://accounting-timer"));
  assert.ok(!origins.includes("app://-"));
  assert.ok(!origins.includes("*"));
});

test("CORS_ORIGINS replaces defaults instead of extending them", () => {
  const origins = parseCorsOrigins({
    CORS_ORIGINS: "https://app.example,app://accounting-timer",
  });
  assert.deepEqual(origins, [
    "https://app.example",
    "app://accounting-timer",
  ]);
  assert.ok(!origins.includes("http://localhost:5173"));
});

test("legacy CORS_ORIGIN replaces defaults", () => {
  assert.deepEqual(parseCorsOrigins({ CORS_ORIGIN: "https://only.example" }), [
    "https://only.example",
  ]);
});

test("resolveJwtSecret requires JWT_SECRET in production", () => {
  assert.throws(
    () => resolveJwtSecret({ NODE_ENV: "production" }),
    /JWT_SECRET must be set in production/,
  );
  assert.equal(
    resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET: "prod-secret" }),
    "prod-secret",
  );
});

test("resolveJwtSecret allows development fallback when unset", () => {
  const secret = resolveJwtSecret({ NODE_ENV: "development" });
  assert.match(secret, /^dev-only/);
});
