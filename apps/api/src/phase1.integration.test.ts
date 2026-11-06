import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { buildApp } from "./app.js";
import { db } from "./db/client.js";
import { auditLogs, users } from "./db/schema.js";
import { seedPhase1 } from "./db/seed.js";
import { pool } from "./db.js";

const hasDb = await pool
  .query("SELECT 1")
  .then(() => true)
  .catch(() => false);

const describeIfDb = hasDb ? test : test.skip;

let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  if (!hasDb) return;
  await seedPhase1();
  app = await buildApp();
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await pool.end();
});

async function login(email: string, password = "Password123!") {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password },
  });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json() as {
    accessToken: string;
    user: { id: string; role: string; employeeId: string };
  };
  return body;
}

describeIfDb("Phase 1 vertical slice: CRM → entry → totals + audit", async () => {
  const admin = await login("admin@example.com");
  const sync = await app.inject({
    method: "POST",
    url: "/api/v1/crm/sync/clients",
    headers: { authorization: `Bearer ${admin.accessToken}` },
  });
  assert.equal(sync.statusCode, 200, sync.body);
  assert.ok((sync.json() as { upserted: number }).upserted >= 3);

  const employee = await login("employee@example.com");
  const clients = await app.inject({
    method: "GET",
    url: "/api/v1/clients",
    headers: { authorization: `Bearer ${employee.accessToken}` },
  });
  assert.equal(clients.statusCode, 200);
  const clientList = clients.json() as Array<{ id: string; name: string }>;
  const client = clientList.find((c) => c.name === "Acme Holdings");
  assert.ok(client);

  const activities = await app.inject({
    method: "GET",
    url: "/api/v1/activities",
    headers: { authorization: `Bearer ${employee.accessToken}` },
  });
  const activityList = activities.json() as Array<{ id: string; code: string }>;
  const activity = activityList.find((a) => a.code === "CONSULT");
  assert.ok(activity);

  const created = await app.inject({
    method: "POST",
    url: "/api/v1/time-entries",
    headers: { authorization: `Bearer ${employee.accessToken}` },
    payload: {
      clientId: client.id,
      activityId: activity.id,
      workDate: "2026-03-15",
      durationMinutes: 90,
      description: "Phase 1 acceptance entry",
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  const entry = created.json() as { id: string; durationMinutes: number };

  const audits = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.entityId, entry.id));
  assert.ok(audits.some((row) => row.action === "insert"));

  const summary = await app.inject({
    method: "GET",
    url: "/api/v1/reports/summary?month=2026-03",
    headers: { authorization: `Bearer ${employee.accessToken}` },
  });
  assert.equal(summary.statusCode, 200);
  const report = summary.json() as { totalMinutes: number };
  assert.ok(report.totalMinutes >= 90);
});

describeIfDb("Employee cannot list another employee entries", async () => {
  const employee = await login("employee@example.com");
  const manager = await login("manager@example.com");
  assert.ok(manager.user.employeeId);

  const forbidden = await app.inject({
    method: "GET",
    url: `/api/v1/time-entries?employeeId=${manager.user.employeeId}`,
    headers: { authorization: `Bearer ${employee.accessToken}` },
  });
  assert.equal(forbidden.statusCode, 403);

  const allowed = await app.inject({
    method: "GET",
    url: `/api/v1/time-entries?employeeId=${manager.user.employeeId}`,
    headers: { authorization: `Bearer ${manager.accessToken}` },
  });
  assert.equal(allowed.statusCode, 200);
});

describeIfDb("Disabled user is rejected on authenticated API calls", async () => {
  const [disabled] = await db
    .select()
    .from(users)
    .where(eq(users.email, "disabled@example.com"))
    .limit(1);
  assert.ok(disabled);

  // Temporarily activate to obtain a token, then disable again.
  await db
    .update(users)
    .set({ active: true, updatedAt: new Date() })
    .where(eq(users.id, disabled.id));
  const session = await login("disabled@example.com");
  await db
    .update(users)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(users.id, disabled.id));

  const me = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  assert.equal(me.statusCode, 403);
});

describeIfDb("Cookie refresh requires trusted Origin", async () => {
  const employee = await login("employee@example.com");
  const loginResponse = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "employee@example.com", password: "Password123!" },
  });
  const cookie = loginResponse.cookies.find((c) => c.name === "at_refresh");
  assert.ok(cookie);

  const badOrigin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/refresh",
    headers: {
      origin: "https://evil.example",
      cookie: `at_refresh=${cookie.value}`,
    },
    payload: {},
  });
  assert.equal(badOrigin.statusCode, 403);

  const ok = await app.inject({
    method: "POST",
    url: "/api/v1/auth/refresh",
    headers: {
      origin: "http://127.0.0.1:5173",
      cookie: `at_refresh=${cookie.value}`,
    },
    payload: {},
  });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.ok(employee.accessToken);
});

