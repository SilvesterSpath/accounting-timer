import { eq } from "drizzle-orm";
import { db } from "./client.js";
import {
  activities,
  clients,
  employees,
  users,
} from "./schema.js";
import { hashPassword } from "../auth/passwords.js";
import { syncMockCrm } from "../services/crm.js";

export const HOSTED_EMPLOYEE_EMAIL = "employee@example.com";
export const HOSTED_OPERATOR_EMAIL = "operator@example.com";

export type DemoBootstrapResult = {
  operatorUserId: string;
  employeeUserId: string;
  createdUsers: string[];
  crmSynced: boolean;
  upsertedClients: number;
};

async function upsertUser(input: {
  email: string;
  role: "employee" | "admin";
  password: string;
  displayName: string;
  createdUsers: string[];
}): Promise<string> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  let userId: string;
  if (existing[0]) {
    userId = existing[0].id;
    // Preserve credentials, role, and active status on repeat bootstrap.
  } else {
    const passwordHash = await hashPassword(input.password);
    const inserted = await db
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        role: input.role,
        active: true,
      })
      .returning();
    const created = inserted[0];
    if (!created) {
      throw new Error(`Failed to create user ${input.email}`);
    }
    userId = created.id;
    input.createdUsers.push(input.email);
  }

  const emp = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, userId))
    .limit(1);
  if (!emp[0]) {
    await db.insert(employees).values({
      userId,
      displayName: input.displayName,
      externalCode: input.email.split("@")[0] ?? input.email,
      active: true,
    });
  }

  return userId;
}

async function ensureCatalog(): Promise<void> {
  const internal = await db
    .select()
    .from(clients)
    .where(eq(clients.externalId, "INTERNAL"))
    .limit(1);
  if (!internal[0]) {
    await db.insert(clients).values({
      sourceSystem: "system",
      externalId: "INTERNAL",
      name: "Internal work",
      active: true,
      isSystemInternal: true,
      syncedAt: new Date(),
    });
  }

  for (const activity of [
    { code: "CONSULT", name: "Consulting", isInternal: false },
    { code: "INTERNAL", name: "Internal", isInternal: true },
  ]) {
    const found = await db
      .select()
      .from(activities)
      .where(eq(activities.code, activity.code))
      .limit(1);
    if (!found[0]) {
      await db.insert(activities).values(activity);
    }
  }
}

/**
 * Hosted Railway demo bootstrap (DEMO_BOOTSTRAP=1).
 * Requires distinct employee + operator passwords.
 * Creates operator first so mock CRM audit uses a real admin user id.
 * Idempotent — never truncates.
 */
export async function runDemoBootstrap(
  env: NodeJS.ProcessEnv = process.env,
): Promise<DemoBootstrapResult> {
  const isProd = env.NODE_ENV === "production";
  if (isProd && env.ALLOW_DEMO_SEED !== "1") {
    throw new Error(
      "DEMO_BOOTSTRAP requires ALLOW_DEMO_SEED=1 in production",
    );
  }

  const employeePassword = env.DEMO_EMPLOYEE_PASSWORD?.trim();
  const operatorPassword = env.DEMO_OPERATOR_PASSWORD?.trim();
  if (!employeePassword) {
    throw new Error("DEMO_EMPLOYEE_PASSWORD is required for demo bootstrap");
  }
  if (!operatorPassword) {
    throw new Error("DEMO_OPERATOR_PASSWORD is required for demo bootstrap");
  }
  if (employeePassword === operatorPassword) {
    throw new Error(
      "DEMO_EMPLOYEE_PASSWORD and DEMO_OPERATOR_PASSWORD must be different",
    );
  }

  const createdUsers: string[] = [];

  // Operator must exist before CRM sync so audit actorUserId is valid.
  const operatorUserId = await upsertUser({
    email: HOSTED_OPERATOR_EMAIL,
    role: "admin",
    password: operatorPassword,
    displayName: "Demo Operator",
    createdUsers,
  });

  const employeeUserId = await upsertUser({
    email: HOSTED_EMPLOYEE_EMAIL,
    role: "employee",
    password: employeePassword,
    displayName: "Eve Employee",
    createdUsers,
  });

  await ensureCatalog();

  const mockClients = await db
    .select()
    .from(clients)
    .where(eq(clients.sourceSystem, "mock_crm"));

  let crmSynced = false;
  let upsertedClients = 0;
  if (mockClients.length === 0) {
    const result = await syncMockCrm(operatorUserId);
    crmSynced = true;
    upsertedClients = result.upserted;
  }

  return {
    operatorUserId,
    employeeUserId,
    createdUsers,
    crmSynced,
    upsertedClients,
  };
}
