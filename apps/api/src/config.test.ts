import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_CORS_ORIGINS,
  parseCorsOrigins,
  resolveJwtSecret,
  resolveListenHost,
  resolveListenPort,
  resolveTrustProxy,
} from "./config.js";

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

test("resolveListenPort prefers PORT then API_PORT", () => {
  assert.equal(resolveListenPort({ PORT: "8080" }), 8080);
  assert.equal(resolveListenPort({ API_PORT: "3001" }), 3001);
  assert.equal(resolveListenPort({ PORT: "9999", API_PORT: "3001" }), 9999);
  assert.equal(resolveListenPort({}), 3001);
});

test("resolveListenHost defaults to 0.0.0.0 in production", () => {
  assert.equal(resolveListenHost({ NODE_ENV: "production" }), "0.0.0.0");
  assert.equal(resolveListenHost({ NODE_ENV: "development" }), "127.0.0.1");
  assert.equal(
    resolveListenHost({ NODE_ENV: "production", API_HOST: "127.0.0.1" }),
    "127.0.0.1",
  );
});

test("resolveTrustProxy is one hop only when TRUST_PROXY=1", () => {
  assert.equal(resolveTrustProxy({}), false);
  assert.equal(resolveTrustProxy({ TRUST_PROXY: "0" }), false);
  const trust = resolveTrustProxy({ TRUST_PROXY: "1" });
  assert.equal(typeof trust, "function");
  if (typeof trust === "function") {
    assert.equal(trust("10.0.0.1", 0), true);
    assert.equal(trust("10.0.0.1", 1), false);
  }
});
