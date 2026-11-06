import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { buildApp } from "./app.js";
import { db } from "./db/client.js";
import { employees, users } from "./db/schema.js";
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
  test("visibility tests refuse non-isolated database URL", () => {
    assert.throws(
      () => assertIsolatedTestDatabaseUrl(config.databaseUrl),
      UnsafeTestDatabaseError,
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

async function catalog(token: string) {
  const clients = await app.inject({
    method: "GET",
    url: "/api/v1/clients",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(clients.statusCode, 200, clients.body);
  const clientList = clients.json() as Array<{ id: string; name: string }>;
  const client =
    clientList.find((c) => c.name === "Belső munka") ?? clientList[0];
  assert.ok(client);

  const activities = await app.inject({
    method: "GET",
    url: "/api/v1/activities",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(activities.statusCode, 200, activities.body);
  const activity = (
    activities.json() as Array<{ id: string; code: string }>
  ).find((a) => a.code === "CONSULT");
  assert.ok(activity);
  return { clientId: client.id, activityId: activity.id };
}

async function createEntry(
  token: string,
  input: {
    clientId: string;
    activityId: string;
    workDate: string;
    durationMinutes: number;
    description: string;
    employeeId?: string;
  },
) {
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/time-entries",
    headers: { authorization: `Bearer ${token}` },
    payload: input,
  });
  assert.equal(created.statusCode, 201, created.body);
  return created.json() as {
    id: string;
    employeeId: string;
    durationMinutes: number;
    version: number;
    description: string | null;
  };
}

run("Role visibility: bidirectional isolation + operator inspect/write", async () => {
  await resetTestData();

  const employeeA = await login("employee@example.com");
  const employeeB = await login("employee-b@example.com");
  const manager = await login("manager@example.com");
  const admin = await login("admin@example.com");

  assert.notEqual(employeeA.user.employeeId, employeeB.user.employeeId);

  const { clientId, activityId } = await catalog(employeeA.accessToken);

  const entryA = await createEntry(employeeA.accessToken, {
    clientId,
    activityId,
    workDate: "2026-04-10",
    durationMinutes: 45,
    description: "Employee A only",
  });
  const entryB = await createEntry(employeeB.accessToken, {
    clientId,
    activityId,
    workDate: "2026-04-10",
    durationMinutes: 120,
    description: "Employee B only",
  });

  // --- A/B list isolation ---
  const listA = await app.inject({
    method: "GET",
    url: "/api/v1/time-entries?workDate=2026-04-10",
    headers: { authorization: `Bearer ${employeeA.accessToken}` },
  });
  assert.equal(listA.statusCode, 200);
  const rowsA = listA.json() as Array<{ id: string }>;
  assert.equal(rowsA.length, 1);
  assert.equal(rowsA[0]?.id, entryA.id);

  const listB = await app.inject({
    method: "GET",
    url: "/api/v1/time-entries?workDate=2026-04-10",
    headers: { authorization: `Bearer ${employeeB.accessToken}` },
  });
  assert.equal(listB.statusCode, 200);
  const rowsB = listB.json() as Array<{ id: string }>;
  assert.equal(rowsB.length, 1);
  assert.equal(rowsB[0]?.id, entryB.id);

  // --- forged cross-employee list / detail / summaries both directions ---
  for (const [actor, targetEmployeeId, targetEntryId] of [
    [employeeA, employeeB.user.employeeId, entryB.id],
    [employeeB, employeeA.user.employeeId, entryA.id],
  ] as const) {
    const crossList = await app.inject({
      method: "GET",
      url: `/api/v1/time-entries?employeeId=${targetEmployeeId}`,
      headers: { authorization: `Bearer ${actor.accessToken}` },
    });
    assert.equal(crossList.statusCode, 403);

    const crossGet = await app.inject({
      method: "GET",
      url: `/api/v1/time-entries/${targetEntryId}`,
      headers: { authorization: `Bearer ${actor.accessToken}` },
    });
    assert.equal(crossGet.statusCode, 403);

    const crossDay = await app.inject({
      method: "GET",
      url: `/api/v1/reports/summary?workDate=2026-04-10&employeeId=${targetEmployeeId}`,
      headers: { authorization: `Bearer ${actor.accessToken}` },
    });
    assert.equal(crossDay.statusCode, 403);

    const crossMonth = await app.inject({
      method: "GET",
      url: `/api/v1/reports/summary?month=2026-04&employeeId=${targetEmployeeId}`,
      headers: { authorization: `Bearer ${actor.accessToken}` },
    });
    assert.equal(crossMonth.statusCode, 403);

    const crossPatch = await app.inject({
      method: "PATCH",
      url: `/api/v1/time-entries/${targetEntryId}`,
      headers: { authorization: `Bearer ${actor.accessToken}` },
      payload: { version: 1, durationMinutes: 1 },
    });
    assert.equal(crossPatch.statusCode, 403);

    const crossDelete = await app.inject({
      method: "DELETE",
      url: `/api/v1/time-entries/${targetEntryId}`,
      headers: { authorization: `Bearer ${actor.accessToken}` },
      payload: { version: 1 },
    });
    assert.equal(crossDelete.statusCode, 403);
  }

  const ownDayA = await app.inject({
    method: "GET",
    url: "/api/v1/reports/summary?workDate=2026-04-10",
    headers: { authorization: `Bearer ${employeeA.accessToken}` },
  });
  assert.equal((ownDayA.json() as { totalMinutes: number }).totalMinutes, 45);

  const ownDayB = await app.inject({
    method: "GET",
    url: "/api/v1/reports/summary?workDate=2026-04-10",
    headers: { authorization: `Bearer ${employeeB.accessToken}` },
  });
  assert.equal((ownDayB.json() as { totalMinutes: number }).totalMinutes, 120);

  // --- employees cannot access management / directory / CRM ---
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: "/api/v1/employees",
        headers: { authorization: `Bearer ${employeeA.accessToken}` },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: "/api/v1/reports/summary?month=2026-04&scope=management",
        headers: { authorization: `Bearer ${employeeA.accessToken}` },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: "/api/v1/reports/summary?month=2026-04&scope=management",
        headers: { authorization: `Bearer ${employeeB.accessToken}` },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/crm/sync/clients",
        headers: { authorization: `Bearer ${employeeA.accessToken}` },
        payload: {},
      })
    ).statusCode,
    403,
  );

  // --- forged employeeId on create is ignored; owner stays authenticated employee ---
  const forged = await createEntry(employeeA.accessToken, {
    clientId,
    activityId,
    workDate: "2026-04-11",
    durationMinutes: 30,
    description: "Forged employeeId attempt",
    employeeId: employeeB.user.employeeId,
  });
  assert.equal(forged.employeeId, employeeA.user.employeeId);

  // --- operator directory includes inactive ---
  const directoryResponse = await app.inject({
    method: "GET",
    url: "/api/v1/employees",
    headers: { authorization: `Bearer ${manager.accessToken}` },
  });
  assert.equal(directoryResponse.statusCode, 200);
  const directory = directoryResponse.json() as Array<{
    id: string;
    displayName: string;
    active: boolean;
  }>;
  assert.ok(directory.some((e) => e.id === employeeA.user.employeeId));
  assert.ok(directory.some((e) => e.id === employeeB.user.employeeId));
  const inactive = directory.find((e) => e.displayName === "Disabled User");
  assert.ok(inactive);
  assert.equal(inactive.active, false);

  const [disabledEmployee] = await db
    .select({ id: employees.id })
    .from(employees)
    .innerJoin(users, eq(employees.userId, users.id))
    .where(eq(users.email, "disabled@example.com"))
    .limit(1);
  assert.ok(disabledEmployee);

  const inspectInactive = await app.inject({
    method: "GET",
    url: `/api/v1/time-entries?employeeId=${disabledEmployee.id}&workDate=2026-04-10`,
    headers: { authorization: `Bearer ${manager.accessToken}` },
  });
  assert.equal(inspectInactive.statusCode, 200);

  // --- operator inspect A and B ---
  const inspectA = await app.inject({
    method: "GET",
    url: `/api/v1/time-entries?workDate=2026-04-10&employeeId=${employeeA.user.employeeId}`,
    headers: { authorization: `Bearer ${manager.accessToken}` },
  });
  assert.equal(inspectA.statusCode, 200);
  assert.equal((inspectA.json() as Array<{ id: string }>).length, 1);
  assert.equal((inspectA.json() as Array<{ id: string }>)[0]?.id, entryA.id);

  const inspectBSummary = await app.inject({
    method: "GET",
    url: `/api/v1/reports/summary?workDate=2026-04-10&employeeId=${employeeB.user.employeeId}`,
    headers: { authorization: `Bearer ${manager.accessToken}` },
  });
  assert.equal(inspectBSummary.statusCode, 200);
  assert.equal(
    (inspectBSummary.json() as { totalMinutes: number }).totalMinutes,
    120,
  );

  const inspectBMonth = await app.inject({
    method: "GET",
    url: `/api/v1/reports/summary?month=2026-04&employeeId=${employeeB.user.employeeId}`,
    headers: { authorization: `Bearer ${manager.accessToken}` },
  });
  assert.equal(inspectBMonth.statusCode, 200);
  assert.equal(
    (inspectBMonth.json() as { totalMinutes: number }).totalMinutes,
    120,
  );

  const management = await app.inject({
    method: "GET",
    url: "/api/v1/reports/summary?month=2026-04&scope=management",
    headers: { authorization: `Bearer ${manager.accessToken}` },
  });
  assert.equal(management.statusCode, 200);
  assert.equal(
    (management.json() as { totalMinutes: number; scope: string }).totalMinutes,
    195,
  );
  assert.equal((management.json() as { scope: string }).scope, "management");

  // --- operators may PATCH/DELETE others; employees may PATCH own ---
  const patchOthers = await app.inject({
    method: "PATCH",
    url: `/api/v1/time-entries/${entryA.id}`,
    headers: { authorization: `Bearer ${manager.accessToken}` },
    payload: { version: entryA.version, durationMinutes: 99 },
  });
  assert.equal(patchOthers.statusCode, 200, patchOthers.body);
  assert.equal(
    (patchOthers.json() as { durationMinutes: number; version: number })
      .durationMinutes,
    99,
  );
  const patchedA = patchOthers.json() as { version: number };

  const deleteOthers = await app.inject({
    method: "DELETE",
    url: `/api/v1/time-entries/${entryB.id}`,
    headers: { authorization: `Bearer ${admin.accessToken}` },
    payload: { version: entryB.version },
  });
  assert.equal(deleteOthers.statusCode, 204, deleteOthers.body);

  const goneB = await app.inject({
    method: "GET",
    url: `/api/v1/time-entries/${entryB.id}`,
    headers: { authorization: `Bearer ${admin.accessToken}` },
  });
  assert.equal(goneB.statusCode, 404);

  const patchOwn = await app.inject({
    method: "PATCH",
    url: `/api/v1/time-entries/${entryA.id}`,
    headers: { authorization: `Bearer ${employeeA.accessToken}` },
    payload: { version: patchedA.version, durationMinutes: 50 },
  });
  assert.equal(patchOwn.statusCode, 200, patchOwn.body);
  assert.equal(
    (patchOwn.json() as { durationMinutes: number }).durationMinutes,
    50,
  );
});
