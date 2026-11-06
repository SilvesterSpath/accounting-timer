import { eq } from "drizzle-orm";
import { db } from "./client.js";
import {
  activities,
  clients,
  employees,
  users,
} from "./schema.js";
import { hashPassword } from "../auth/passwords.js";
import { applyMigrations } from "./migrate.js";
import { pool } from "../db.js";

const SEED_PASSWORD = "Password123!";

export async function seedPhase1(): Promise<void> {
  await applyMigrations();

  const passwordHash = await hashPassword(SEED_PASSWORD);

  async function upsertUser(input: {
    email: string;
    role: "employee" | "manager" | "admin";
    active: boolean;
    displayName: string;
  }) {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    let userId: string;
    if (existing[0]) {
      userId = existing[0].id;
      await db
        .update(users)
        .set({
          passwordHash,
          role: input.role,
          active: input.active,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    } else {
      const inserted = await db
        .insert(users)
        .values({
          email: input.email,
          passwordHash,
          role: input.role,
          active: input.active,
        })
        .returning();
      const created = inserted[0];
      if (!created) {
        throw new Error(`Failed to create user ${input.email}`);
      }
      userId = created.id;
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
        externalCode: input.email.split("@")[0],
        active: input.active,
      });
    }
  }

  await upsertUser({
    email: "employee@example.com",
    role: "employee",
    active: true,
    displayName: "Eve Employee",
  });
  await upsertUser({
    email: "manager@example.com",
    role: "manager",
    active: true,
    displayName: "Morgan Manager",
  });
  await upsertUser({
    email: "admin@example.com",
    role: "admin",
    active: true,
    displayName: "Ada Admin",
  });
  await upsertUser({
    email: "disabled@example.com",
    role: "employee",
    active: false,
    displayName: "Disabled User",
  });

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

if (
  process.argv[1]?.endsWith("seed.ts") ||
  process.argv[1]?.endsWith("seed.js")
) {
  seedPhase1()
    .then(async () => {
      console.log("Seed complete. Demo password:", SEED_PASSWORD);
      await pool.end();
    })
    .catch(async (error) => {
      console.error(error);
      await pool.end();
      process.exit(1);
    });
}
