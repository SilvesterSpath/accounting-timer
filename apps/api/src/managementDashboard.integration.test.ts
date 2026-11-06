import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { buildApp } from "./app.js";
import { db } from "./db/client.js";
import { clients } from "./db/schema.js";
import { seedDemoUsers } from "./db/seed.js";
import { pool } from "./db.js";
import { config } from "./config.js";
import { resetLoginThrottleForTests } from "./auth/loginThrottle.js";
import {
  assertIsolatedTestDatabaseUrl,
  isIsolatedTestDatabaseUrl,
  UnsafeTestDatabaseError,
} from "./test/assertIsolatedTestDatabase.js";

const usingTestDb = isIsolatedTestDatabaseUrl(config.databaseUrl);

const hasDb = await pool
  .query("SELECT 1")
  .then(() => true)
  .catch(() => false);

const run = hasDb && usingTestDb ? test : test.skip;

if (!usingTestDb) {
  test("management dashboard tests refuse non-isolated database URL", () => {
    assert.throws(
      () => assertIsolatedTestDatabaseUrl(config.databaseUrl),
      UnsafeTestDatabaseError,
    );
  });
}

let app: Awaited<ReturnType<typeof buildApp>>;

type WorkloadBody = {
  month: string;
  totalMinutes: number;
  totalHoursDisplay: number;
  entryCount: number;
  activeClientCount: number;
  byClient: Array<{
    clientId: string;
    name: string;
    isSystemInternal: boolean;
    totalMinutes: number;
    totalHoursDisplay: number;
    entryCount: number;
  }>;
};

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

async function catalog(token: string) {
  const clientsRes = await app.inject({
    method: "GET",
    url: "/api/v1/clients",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(clientsRes.statusCode, 200);
  const clientList = clientsRes.json() as Array<{
    id: string;
    name: string;
    isSystemInternal: boolean;
  }>;
  const activitiesRes = await app.inject({
    method: "GET",
    url: "/api/v1/activities",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(activitiesRes.statusCode, 200);
  const activity = (
    activitiesRes.json() as Array<{ id: string; code: string }>
  ).find((a) => a.code === "CONSULT");
  assert.ok(activity);
  return { clientList, activityId: activity.id };
}

async function createEntry(
  token: string,
  input: {
    clientId: string;
    activityId: string;
    workDate: string;
    durationMinutes: number;
    description: string;
  },
) {
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/time-entries",
    headers: { authorization: `Bearer ${token}` },
    payload: input,
  });
  assert.equal(created.statusCode, 201, created.body);
  return created.json() as { id: string; version: number };
}

function assertReconciled(body: WorkloadBody): void {
  const sumMinutes = body.byClient.reduce((s, r) => s + r.totalMinutes, 0);
  const sumEntries = body.byClient.reduce((s, r) => s + r.entryCount, 0);
  assert.equal(body.totalMinutes, sumMinutes);
  assert.equal(body.entryCount, sumEntries);
}

run("Employee is denied management client-workload reporting", async () => {
  await resetTestData();
  const employee = await login("employee@example.com");
  const denied = await app.inject({
    method: "GET",
    url: "/api/v1/reports/management/client-workload?month=2026-06",
    headers: { authorization: `Bearer ${employee.accessToken}` },
  });
  assert.equal(denied.statusCode, 403);
});

run("Missing and invalid month parameters return HTTP 400", async () => {
  await resetTestData();
  const manager = await login("manager@example.com");

  const missing = await app.inject({
    method: "GET",
    url: "/api/v1/reports/management/client-workload",
    headers: { authorization: `Bearer ${manager.accessToken}` },
  });
  assert.equal(missing.statusCode, 400);

  const malformed = await app.inject({
    method: "GET",
    url: "/api/v1/reports/management/client-workload?month=2026-13",
    headers: { authorization: `Bearer ${manager.accessToken}` },
  });
  assert.equal(malformed.statusCode, 400);

  const junk = await app.inject({
    method: "GET",
    url: "/api/v1/reports/management/client-workload?month=june",
    headers: { authorization: `Bearer ${manager.accessToken}` },
  });
  assert.equal(junk.statusCode, 400);
});

run("Admin can access management client-workload directly", async () => {
  await resetTestData();
  const admin = await login("admin@example.com");
  const report = await app.inject({
    method: "GET",
    url: "/api/v1/reports/management/client-workload?month=2026-02",
    headers: { authorization: `Bearer ${admin.accessToken}` },
  });
  assert.equal(report.statusCode, 200, report.body);
  const body = report.json() as WorkloadBody;
  assert.equal(body.month, "2026-02");
  assertReconciled(body);
});

run("Management client workload aggregates, reconciles, and excludes deleted", async () => {
  await resetTestData();
  const admin = await login("admin@example.com");
  const sync = await app.inject({
    method: "POST",
    url: "/api/v1/crm/sync/clients",
    headers: { authorization: `Bearer ${admin.accessToken}` },
  });
  assert.equal(sync.statusCode, 200);

  const employee = await login("employee@example.com");
  const { clientList, activityId } = await catalog(employee.accessToken);
  const acme = clientList.find((c) => c.name === "Acme Holdings");
  const contoso = clientList.find((c) => c.name === "Contoso Legal");
  const internal = clientList.find((c) => c.isSystemInternal);
  assert.ok(acme);
  assert.ok(contoso);
  assert.ok(internal);

  // Exact month boundaries (inclusive start, exclusive next month).
  await createEntry(employee.accessToken, {
    clientId: acme.id,
    activityId,
    workDate: "2026-06-01",
    durationMinutes: 60,
    description: "June first day",
  });
  await createEntry(employee.accessToken, {
    clientId: acme.id,
    activityId,
    workDate: "2026-06-30",
    durationMinutes: 45,
    description: "June last day",
  });
  await createEntry(employee.accessToken, {
    clientId: internal.id,
    activityId,
    workDate: "2026-06-15",
    durationMinutes: 30,
    description: "Internal June",
  });
  // Outside bounds — excluded.
  await createEntry(employee.accessToken, {
    clientId: acme.id,
    activityId,
    workDate: "2026-05-31",
    durationMinutes: 400,
    description: "May last day",
  });
  await createEntry(employee.accessToken, {
    clientId: acme.id,
    activityId,
    workDate: "2026-07-01",
    durationMinutes: 400,
    description: "July first day",
  });

  const toDelete = await createEntry(employee.accessToken, {
    clientId: contoso.id,
    activityId,
    workDate: "2026-06-10",
    durationMinutes: 90,
    description: "Will delete",
  });
  const deleted = await app.inject({
    method: "DELETE",
    url: `/api/v1/time-entries/${toDelete.id}`,
    headers: { authorization: `Bearer ${employee.accessToken}` },
    payload: { version: toDelete.version },
  });
  assert.equal(deleted.statusCode, 204);

  const manager = await login("manager@example.com");
  const report = await app.inject({
    method: "GET",
    url: "/api/v1/reports/management/client-workload?month=2026-06",
    headers: { authorization: `Bearer ${manager.accessToken}` },
  });
  assert.equal(report.statusCode, 200, report.body);
  const body = report.json() as WorkloadBody;

  assert.equal(body.month, "2026-06");
  assert.equal(body.totalMinutes, 135);
  assert.equal(body.totalHoursDisplay, 2.25);
  assert.equal(body.entryCount, 3);
  assertReconciled(body);

  assert.equal(body.byClient.length, 2);
  assert.equal(body.byClient[0]?.clientId, acme.id);
  assert.equal(body.byClient[0]?.totalMinutes, 105);
  assert.equal(body.byClient[0]?.isSystemInternal, false);
  assert.equal(body.byClient[1]?.clientId, internal.id);
  assert.equal(body.byClient[1]?.totalMinutes, 30);
  assert.equal(body.byClient[1]?.isSystemInternal, true);

  // Active external clients only (active && !isSystemInternal).
  const externalActive = await db
    .select()
    .from(clients)
    .where(and(eq(clients.active, true), eq(clients.isSystemInternal, false)));
  assert.equal(body.activeClientCount, externalActive.length);
  assert.ok(body.activeClientCount >= 1);
  assert.ok(body.byClient.some((c) => c.isSystemInternal));

  const empty = await app.inject({
    method: "GET",
    url: "/api/v1/reports/management/client-workload?month=2026-01",
    headers: { authorization: `Bearer ${manager.accessToken}` },
  });
  assert.equal(empty.statusCode, 200);
  const emptyBody = empty.json() as WorkloadBody;
  assert.equal(emptyBody.totalMinutes, 0);
  assert.deepEqual(emptyBody.byClient, []);
  assertReconciled(emptyBody);
  assert.equal(emptyBody.activeClientCount, body.activeClientCount);
});
