import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { buildApp } from "../app.js";
import { pool } from "../db.js";
import { config } from "../config.js";
import { db } from "./client.js";
import { auditLogs, clients, users } from "./schema.js";
import { isIsolatedTestDatabaseUrl } from "../test/assertIsolatedTestDatabase.js";
import {
  HOSTED_EMPLOYEE_EMAIL,
  HOSTED_OPERATOR_EMAIL,
  runDemoBootstrap,
} from "./demoBootstrap.js";
import { resetLoginThrottleForTests } from "../auth/loginThrottle.js";

test("demo bootstrap rejects missing or matching passwords", async () => {
  await assert.rejects(
    () =>
      runDemoBootstrap({
        NODE_ENV: "test",
        ALLOW_DEMO_SEED: "1",
        DEMO_EMPLOYEE_PASSWORD: "only-one",
      }),
    /DEMO_OPERATOR_PASSWORD/,
  );
  await assert.rejects(
    () =>
      runDemoBootstrap({
        NODE_ENV: "test",
        ALLOW_DEMO_SEED: "1",
        DEMO_EMPLOYEE_PASSWORD: "same",
        DEMO_OPERATOR_PASSWORD: "same",
      }),
    /must be different/,
  );
});

const usingTestDb = isIsolatedTestDatabaseUrl(config.databaseUrl);
const hasDb = await pool
  .query("SELECT 1")
  .then(() => true)
  .catch(() => false);
const run = hasDb && usingTestDb ? test : test.skip;

run("hosted bootstrap creates operator then CRM audit; employee cannot sync", async () => {
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

  const env = {
    NODE_ENV: "test",
    ALLOW_DEMO_SEED: "1",
    DEMO_EMPLOYEE_PASSWORD: "EmployeeOnly-Pass1!",
    DEMO_OPERATOR_PASSWORD: "OperatorOnly-Pass1!",
  };

  const first = await runDemoBootstrap(env);
  assert.ok(first.operatorUserId);
  assert.ok(first.employeeUserId);
  assert.notEqual(first.operatorUserId, first.employeeUserId);
  assert.equal(first.crmSynced, true);
  assert.ok(first.upsertedClients >= 3);

  const operator = await db
    .select()
    .from(users)
    .where(eq(users.email, HOSTED_OPERATOR_EMAIL))
    .limit(1);
  assert.equal(operator[0]?.role, "admin");

  const employee = await db
    .select()
    .from(users)
    .where(eq(users.email, HOSTED_EMPLOYEE_EMAIL))
    .limit(1);
  assert.equal(employee[0]?.role, "employee");

  const audits = await db.select().from(auditLogs);
  assert.ok(audits.length >= 3);
  assert.ok(audits.every((row) => row.actorUserId === first.operatorUserId));

  const mockCount = await db
    .select()
    .from(clients)
    .where(eq(clients.sourceSystem, "mock_crm"));
  assert.equal(mockCount.length, 3);

  const second = await runDemoBootstrap(env);
  assert.equal(second.crmSynced, false);
  assert.deepEqual(second.createdUsers, []);
  const mockCount2 = await db
    .select()
    .from(clients)
    .where(eq(clients.sourceSystem, "mock_crm"));
  assert.equal(mockCount2.length, 3);

  const app = await buildApp({ serveStatic: false });
  try {
    await app.ready();

    resetLoginThrottleForTests();
    const employeeLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: "http://127.0.0.1:5173" },
      payload: {
        email: HOSTED_EMPLOYEE_EMAIL,
        password: "EmployeeOnly-Pass1!",
      },
    });
    assert.equal(employeeLogin.statusCode, 200, employeeLogin.body);
    const empBody = employeeLogin.json() as {
      accessToken: string;
      user: { role: string };
    };
    assert.equal(empBody.user.role, "employee");

    const forbiddenSync = await app.inject({
      method: "POST",
      url: "/api/v1/crm/sync/clients",
      headers: { authorization: `Bearer ${empBody.accessToken}` },
    });
    assert.equal(forbiddenSync.statusCode, 403);

    resetLoginThrottleForTests();
    const asOperatorWithEmployeePass = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: HOSTED_OPERATOR_EMAIL,
        password: "EmployeeOnly-Pass1!",
      },
    });
    assert.equal(asOperatorWithEmployeePass.statusCode, 401);

    resetLoginThrottleForTests();
    const operatorLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: HOSTED_OPERATOR_EMAIL,
        password: "OperatorOnly-Pass1!",
      },
    });
    assert.equal(operatorLogin.statusCode, 200, operatorLogin.body);
    assert.equal(
      (operatorLogin.json() as { user: { role: string } }).user.role,
      "admin",
    );
  } finally {
    await app.close();
  }
});
