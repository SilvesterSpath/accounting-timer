import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Fastify from "fastify";
import {
  looksLikeStaticAsset,
  registerStaticSite,
  shouldStripTrailingSlash,
} from "./staticSite.js";

test("looksLikeStaticAsset detects JS/CSS and ignores routes", () => {
  assert.equal(looksLikeStaticAsset("/assets/index-abc.js"), true);
  assert.equal(looksLikeStaticAsset("/assets/index-abc.css"), true);
  assert.equal(looksLikeStaticAsset("/app"), false);
  assert.equal(looksLikeStaticAsset("/login"), false);
  assert.equal(looksLikeStaticAsset("/api/v1/health"), false);
});

test("shouldStripTrailingSlash for SPA paths only", () => {
  assert.equal(shouldStripTrailingSlash("/app/"), true);
  assert.equal(shouldStripTrailingSlash("/login/"), true);
  assert.equal(shouldStripTrailingSlash("/app"), false);
  assert.equal(shouldStripTrailingSlash("/"), false);
  assert.equal(shouldStripTrailingSlash("/api/v1/x/"), false);
});

test("static site: /app and /app/ + asset 404 + api 404", async () => {
  const root = mkdtempSync(join(tmpdir(), "at-web-"));
  writeFileSync(
    join(root, "index.html"),
    "<!doctype html><title>demo</title><script src=\"./assets/app.js\"></script>",
  );
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "assets", "app.js"), "console.log(1)");

  const app = Fastify({ logger: false });
  app.get("/api/v1/health", async () => ({ ok: true }));
  await registerStaticSite(app, root);
  await app.ready();
  try {
    const appPath = await app.inject({ method: "GET", url: "/app" });
    assert.equal(appPath.statusCode, 200);
    assert.match(appPath.body, /demo/);

    const trailing = await app.inject({ method: "GET", url: "/app/" });
    assert.equal(trailing.statusCode, 302);
    assert.equal(trailing.headers.location, "/app");

    const asset = await app.inject({ method: "GET", url: "/assets/app.js" });
    assert.equal(asset.statusCode, 200);
    assert.match(asset.body, /console\.log/);

    const missingAsset = await app.inject({
      method: "GET",
      url: "/assets/missing.js",
    });
    assert.equal(missingAsset.statusCode, 404);
    assert.ok(!missingAsset.body.includes("<!doctype html>"));

    const missingApi = await app.inject({
      method: "GET",
      url: "/api/v1/does-not-exist",
    });
    assert.equal(missingApi.statusCode, 404);
    assert.equal(
      (missingApi.json() as { error: string }).error,
      "Not Found",
    );
  } finally {
    await app.close();
  }
});
