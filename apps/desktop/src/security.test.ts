import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  APP_INDEX_URL,
  CANONICAL_APP_ORIGIN,
  MAX_FIXTURE_BYTES,
  assertFixturePayload,
  isAllowedDevOrigin,
  isCanonicalAppUrl,
  isNavigationAllowed,
  resolveRendererLoadUrl,
  shouldAttachAppProtocol,
  validateApiBaseUrl,
} from "./security.js";

const here = dirname(fileURLToPath(import.meta.url));

test("canonical app origin is stable", () => {
  assert.equal(CANONICAL_APP_ORIGIN, "app://accounting-timer");
  assert.equal(APP_INDEX_URL, "app://accounting-timer/index.html");
});

test("packaged mode ignores ELECTRON_START_URL", () => {
  const result = resolveRendererLoadUrl({
    isPackaged: true,
    electronStartUrl: "http://evil.example/phishing",
  });
  assert.equal(result.mode, "app");
  assert.equal(result.url, APP_INDEX_URL);
});

test("packaged mode ignores lookalike and arbitrary env URLs", () => {
  for (const electronStartUrl of [
    "http://127.0.0.1.attacker:5173",
    "https://example.com",
    "file:///C:/Windows/System32/drivers/etc/hosts",
    "app://evil/index.html",
  ]) {
    const result = resolveRendererLoadUrl({
      isPackaged: true,
      electronStartUrl,
    });
    assert.equal(result.url, APP_INDEX_URL);
  }
});

test("dev ELECTRON_START_URL must be exact allowlisted origin", () => {
  assert.equal(
    resolveRendererLoadUrl({
      isPackaged: false,
      electronStartUrl: "http://127.0.0.1:5173",
    }).url,
    "http://127.0.0.1:5173",
  );
  assert.throws(() =>
    resolveRendererLoadUrl({
      isPackaged: false,
      electronStartUrl: "http://127.0.0.1.attacker:5173",
    }),
  );
  assert.throws(() =>
    resolveRendererLoadUrl({
      isPackaged: false,
      electronStartUrl: "http://evil.example",
    }),
  );
});

test("canonical app URL checks reject unexpected hosts", () => {
  assert.equal(isCanonicalAppUrl("app://accounting-timer/index.html"), true);
  assert.equal(isCanonicalAppUrl("app://accounting-timer/#/smoke"), true);
  assert.equal(isCanonicalAppUrl("app://-/index.html"), false);
  assert.equal(isCanonicalAppUrl("app://evil/index.html"), false);
  assert.equal(isCanonicalAppUrl("app://accounting-timer.evil/"), false);
  assert.equal(isCanonicalAppUrl("https://accounting-timer"), false);
});

test("canonical app URL rejects port, username, and password", () => {
  assert.equal(isCanonicalAppUrl("app://accounting-timer:443/index.html"), false);
  assert.equal(
    isCanonicalAppUrl("app://user@accounting-timer/index.html"),
    false,
  );
  assert.equal(
    isCanonicalAppUrl("app://user:pass@accounting-timer/index.html"),
    false,
  );
  assert.equal(
    isCanonicalAppUrl("app://accounting-timer:5173/#/smoke"),
    false,
  );
});

test("dev origin checks are exact and reject prefixes/lookalikes", () => {
  assert.equal(isAllowedDevOrigin("http://127.0.0.1:5173/"), true);
  assert.equal(isAllowedDevOrigin("http://localhost:5173/app"), true);
  assert.equal(isAllowedDevOrigin("http://127.0.0.1.attacker:5173"), false);
  assert.equal(isAllowedDevOrigin("http://127.0.0.1:51730"), false);
  assert.equal(isAllowedDevOrigin("http://localhost:5173.evil"), false);
});

test("navigation allowlist uses parsed origins", () => {
  assert.equal(
    isNavigationAllowed("app://accounting-timer/#/smoke", {
      allowDevOrigins: false,
    }),
    true,
  );
  assert.equal(
    isNavigationAllowed("app://accounting-timer:443/#/smoke", {
      allowDevOrigins: false,
    }),
    false,
  );
  assert.equal(
    isNavigationAllowed("app://user:pass@accounting-timer/#/smoke", {
      allowDevOrigins: false,
    }),
    false,
  );
  assert.equal(
    isNavigationAllowed("http://127.0.0.1:5173/#/smoke", {
      allowDevOrigins: false,
    }),
    false,
  );
  assert.equal(
    isNavigationAllowed("http://127.0.0.1:5173/#/smoke", {
      allowDevOrigins: true,
    }),
    true,
  );
});

test("validateApiBaseUrl enforces loopback HTTP and https remote", () => {
  assert.equal(
    validateApiBaseUrl("http://127.0.0.1:3001/"),
    "http://127.0.0.1:3001",
  );
  assert.equal(
    validateApiBaseUrl("https://api.example.com/v1"),
    "https://api.example.com/v1",
  );
  assert.throws(() => validateApiBaseUrl("http://example.com"));
  assert.throws(() => validateApiBaseUrl("ftp://127.0.0.1"));
  assert.throws(() => validateApiBaseUrl("http://user:pass@127.0.0.1:3001"));
  assert.throws(() => validateApiBaseUrl("not-a-url"));
});

test("fixture payload size is limited", () => {
  assert.deepEqual(
    assertFixturePayload({ fileName: "a.txt", contents: "ok" }),
    { fileName: "a.txt", contents: "ok" },
  );
  assert.throws(() =>
    assertFixturePayload({
      fileName: "big.txt",
      contents: "x".repeat(MAX_FIXTURE_BYTES + 1),
    }),
  );
  assert.throws(() => assertFixturePayload(null));
});

test("shouldAttachAppProtocol is true for packaged builds", () => {
  assert.equal(
    shouldAttachAppProtocol({ isPackaged: true, loadMode: "dev" }),
    true,
  );
  assert.equal(
    shouldAttachAppProtocol({ isPackaged: false, loadMode: "dev" }),
    false,
  );
  assert.equal(
    shouldAttachAppProtocol({ isPackaged: false, loadMode: "app" }),
    true,
  );
});

test("main source keeps security baseline and denies external opens", () => {
  const main = readFileSync(join(here, "main.ts"), "utf8");
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /assertTrustedIpc/);
  assert.match(main, /senderFrame/);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: "deny" \}\)\)/);
  assert.doesNotMatch(main, /shell\.openExternal/);
  assert.ok(!main.includes("shell,"), "shell must not be imported from electron");
  assert.match(main, /app\.isPackaged/);
});

test("protocol rejects non-canonical hosts in source", () => {
  const protocol = readFileSync(join(here, "protocol.ts"), "utf8");
  const security = readFileSync(join(here, "security.ts"), "utf8");
  assert.match(protocol, /registerSchemesAsPrivileged/);
  assert.match(protocol, /isCanonicalAppUrl\(request\.url\)/);
  assert.match(protocol, /Content-Security-Policy/);
  assert.match(security, /APP_HOST = "accounting-timer"/);
  assert.match(security, /url\.port !== ""/);
  assert.match(security, /url\.username/);
  assert.match(security, /url\.password/);
});
