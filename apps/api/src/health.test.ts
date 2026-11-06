import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "./app.js";
import { pool } from "./db.js";

const app = await buildApp();

before(async () => {
  await app.ready();
});

after(async () => {
  await app.close();
  await pool.end();
});

test("GET /api/v1/health returns API health payload", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/v1/health",
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as {
    status: string;
    service: string;
    database: string;
    node: string;
  };
  assert.equal(body.service, "api");
  assert.match(body.node, /^v24\./);
  assert.ok(body.database === "up" || body.database === "down");
  assert.ok(body.status === "ok" || body.status === "degraded");
});

test("GET /api/v1/health reports database up when Postgres is reachable", async (t) => {
  const response = await app.inject({
    method: "GET",
    url: "/api/v1/health",
  });
  const body = response.json() as { database: string; status: string };

  if (body.database !== "up") {
    t.skip("Postgres is down — run `pnpm db:up` for DB-backed acceptance");
    return;
  }
  assert.equal(body.status, "ok");
});
