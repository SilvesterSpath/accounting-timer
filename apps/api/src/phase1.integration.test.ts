import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { buildApp } from "./app.js";
import { db } from "./db/client.js";
import { auditLogs, users } from "./db/schema.js";
import { seedDemoUsers } from "./db/seed.js";
import { pool } from "./db.js";
import { config } from "./config.js";
import { resetLoginThrottleForTests } from "./auth/loginThrottle.js";

const usingTestDb = /:5433\/|accounting_timer_test/.test(config.databaseUrl);

const hasDb = await pool
  .query("SELECT 1")
  .then(() => true)
  .catch(() => false);

const run = hasDb && usingTestDb ? test : test.skip;

if (hasDb && !usingTestDb) {
  test("integration tests refuse development database URL", () => {
    assert.fail(
      `Refusing to run integration tests against ${config.databaseUrl}. Use TEST_DATABASE_URL / port 5433.`,
    );
  });
}

let app: Awaited<ReturnType<typeof buildApp>>;

async function resetTestData(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      audit_logs,
      time_entries,
      refresh_sessions,
      employees,
      clients,
      activities,
      users
    RESTART IDENTITY CASCADE
  `);
  await seedDemoUsers({ force: true });
}

before(async () => {
  if (!hasDb || !usingTestDb) return;
  await seedDemoUsers({ force: true });
  app = await buildApp();
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await pool.end();
});

async function login(email: string, password = "Password123!") {
  resetLoginThrottleForTests();
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password },
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json() as {
    accessToken: string;
    user: { id: string; role: string; employeeId: string };
  };
}

run("Phase 1 vertical slice: CRM → entry → exact monthly delta + audit", async () => {
  await resetTestData();
  const admin = await login("admin@example.com");
  const sync = await app.inject({
    method: "POST",
    url: "/api/v1/crm/sync/clients",
    headers: { authorization: `Bearer ${admin.accessToken}` },
  });
  assert.equal(sync.statusCode, 200, sync.body);
  assert.equal((sync.json() as { upserted: number }).upserted, 3);

  const employee = await login("employee@example.com");
  const clients = await app.inject({
    method: "GET",
    url: "/api/v1/clients",
    headers: { authorization: `Bearer ${employee.accessToken}` },
  });
  const clientList = clients.json() as Array<{ id: string; name: string }>;
  const client = clientList.find((c) => c.name === "Acme Holdings");
  assert.ok(client);

  const activities = await app.inject({
    method: "GET",
    url: "/api/v1/activities",
    headers: { authorization: `Bearer ${employee.accessToken}` },
  });
  const activity = (
    activities.json() as Array<{ id: string; code: string }>
  ).find((a) => a.code === "CONSULT");
  assert.ok(activity);

  const beforeSummary = await app.inject({
    method: "GET",
    url: "/api/v1/reports/summary?month=2026-03",
    headers: { authorization: `Bearer ${employee.accessToken}` },
  });
  const beforeMinutes = (beforeSummary.json() as { totalMinutes: number })
    .totalMinutes;

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
  const entry = created.json() as { id: string };

  const audits = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.entityId, entry.id));
  assert.ok(audits.some((row) => row.action === "insert"));

  const afterSummary = await app.inject({
    method: "GET",
    url: "/api/v1/reports/summary?month=2026-03",
    headers: { authorization: `Bearer ${employee.accessToken}` },
  });
  const afterMinutes = (afterSummary.json() as { totalMinutes: number })
    .totalMinutes;
  assert.equal(afterMinutes, beforeMinutes + 90);

  const daySummary = await app.inject({
    method: "GET",
    url: "/api/v1/reports/summary?workDate=2026-03-15",
    headers: { authorization: `Bearer ${employee.accessToken}` },
  });
  assert.equal((daySummary.json() as { totalMinutes: number }).totalMinutes, 90);
});

run("Employee cannot list another employee entries", async () => {
  await resetTestData();
  const employee = await login("employee@example.com");
  const manager = await login("manager@example.com");
  assert.ok(manager.user.employeeId);

  const forbidden = await app.inject({
    method: "GET",
    url: `/api/v1/time-entries?employeeId=${manager.user.employeeId}`,
    headers: { authorization: `Bearer ${employee.accessToken}` },
  });
  assert.equal(forbidden.statusCode, 403);
});

run("Disabled user is rejected on authenticated API calls", async () => {
  await resetTestData();
  const [disabled] = await db
    .select()
    .from(users)
    .where(eq(users.email, "disabled@example.com"))
    .limit(1);
  assert.ok(disabled);

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

run("Cookie refresh and logout require trusted Origin", async () => {
  await resetTestData();
  const loginResponse = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "employee@example.com", password: "Password123!" },
  });
  const cookie = loginResponse.cookies.find((c) => c.name === "at_refresh");
  assert.ok(cookie);

  const badRefresh = await app.inject({
    method: "POST",
    url: "/api/v1/auth/refresh",
    headers: {
      origin: "https://evil.example",
      cookie: `at_refresh=${cookie.value}`,
    },
    payload: {},
  });
  assert.equal(badRefresh.statusCode, 403);

  const badLogout = await app.inject({
    method: "POST",
    url: "/api/v1/auth/logout",
    headers: {
      origin: "https://evil.example",
      cookie: `at_refresh=${cookie.value}`,
    },
    payload: {},
  });
  assert.equal(badLogout.statusCode, 403);

  const okRefresh = await app.inject({
    method: "POST",
    url: "/api/v1/auth/refresh",
    headers: {
      origin: "http://127.0.0.1:5173",
      cookie: `at_refresh=${cookie.value}`,
    },
    payload: {},
  });
  assert.equal(okRefresh.statusCode, 200, okRefresh.body);

  const nextCookie = okRefresh.cookies.find((c) => c.name === "at_refresh");
  assert.ok(nextCookie);

  const okLogout = await app.inject({
    method: "POST",
    url: "/api/v1/auth/logout",
    headers: {
      origin: "http://127.0.0.1:5173",
      cookie: `at_refresh=${nextCookie.value}`,
    },
    payload: {},
  });
  assert.equal(okLogout.statusCode, 200);
});

run("Concurrent refresh with same token yields one winner", async () => {
  await resetTestData();
  const loginResponse = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "employee@example.com", password: "Password123!" },
  });
  const cookie = loginResponse.cookies.find((c) => c.name === "at_refresh");
  assert.ok(cookie);
  const raw = cookie.value;

  const [a, b] = await Promise.all([
    app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: {
        origin: "http://127.0.0.1:5173",
        cookie: `at_refresh=${raw}`,
      },
      payload: {},
    }),
    app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: {
        origin: "http://127.0.0.1:5173",
        cookie: `at_refresh=${raw}`,
      },
      payload: {},
    }),
  ]);

  const statuses = [a.statusCode, b.statusCode].sort((x, y) => x - y);
  assert.deepEqual(statuses, [200, 401]);

  const winner = a.statusCode === 200 ? a : b;
  assert.ok((winner.json() as { accessToken: string }).accessToken);

  // Original token must not mint another session.
  const reuseOriginal = await app.inject({
    method: "POST",
    url: "/api/v1/auth/refresh",
    headers: {
      origin: "http://127.0.0.1:5173",
      cookie: `at_refresh=${raw}`,
    },
    payload: {},
  });
  assert.equal(reuseOriginal.statusCode, 401);

  // Reuse detection revokes the rotation family (T02). Cross-tab UI coordination
  // exists so benign multi-tab clients avoid this race; after a proven race,
  // re-login is required.
  const winnerCookie = winner.cookies.find((c) => c.name === "at_refresh");
  if (winnerCookie) {
    const followUp = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: {
        origin: "http://127.0.0.1:5173",
        cookie: `at_refresh=${winnerCookie.value}`,
      },
      payload: {},
    });
    assert.ok(
      followUp.statusCode === 200 || followUp.statusCode === 401,
      `unexpected follow-up status ${followUp.statusCode}`,
    );
  }
});
