import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "./app.js";

test("GET /api/v1/ready returns 200 when database is up", async () => {
  const app = await buildApp({
    serveStatic: false,
    checkDatabase: async () => "up",
  });
  after(async () => {
    await app.close();
  });
  await app.ready();

  const response = await app.inject({ method: "GET", url: "/api/v1/ready" });
  assert.equal(response.statusCode, 200);
  const body = response.json() as { status: string; database: string };
  assert.equal(body.status, "ready");
  assert.equal(body.database, "up");
});

test("GET /api/v1/ready returns 503 when database is down", async () => {
  const app = await buildApp({
    serveStatic: false,
    checkDatabase: async () => "down",
  });
  after(async () => {
    await app.close();
  });
  await app.ready();

  const response = await app.inject({ method: "GET", url: "/api/v1/ready" });
  assert.equal(response.statusCode, 503);
  const body = response.json() as { status: string; database: string };
  assert.equal(body.status, "not_ready");
  assert.equal(body.database, "down");
});

test("GET /api/v1/health stays 200 when database is down (liveness)", async () => {
  const app = await buildApp({
    serveStatic: false,
    checkDatabase: async () => "down",
  });
  after(async () => {
    await app.close();
  });
  await app.ready();

  const response = await app.inject({ method: "GET", url: "/api/v1/health" });
  assert.equal(response.statusCode, 200);
  const body = response.json() as { status: string; database: string };
  assert.equal(body.status, "degraded");
  assert.equal(body.database, "down");
});
