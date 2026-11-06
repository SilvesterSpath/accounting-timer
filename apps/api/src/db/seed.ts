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
import { seedShowcaseWorkload } from "./showcaseWorkload.js";

export const DEMO_SEED_PASSWORD = "Password123!";

/**
 * Development-only demo seed.
 * Inserts missing demo users / internal client / activities.
 * Never overwrites existing users' password, role, or active flag.
 */
export async function seedDemoUsers(options: {
  /** Allow when NODE_ENV=production only if operator set ALLOW_DEMO_SEED=1 or tests pass this. */
  force?: boolean;
  /** Seed distinctive demo time entries for the current Budapest month (CLI / hosted). */
  withShowcase?: boolean;
} = {}): Promise<{
  createdUsers: string[];
  showcase: {
    clientsEnsured: number;
    entriesInserted: number;
    month: string;
  } | null;
}> {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && process.env.ALLOW_DEMO_SEED !== "1" && !options.force) {
    throw new Error(
      "Demo seed is disabled in production without ALLOW_DEMO_SEED=1",
    );
  }

  await applyMigrations();
  const passwordHash = await hashPassword(DEMO_SEED_PASSWORD);
  const createdUsers: string[] = [];

  async function insertUserIfMissing(input: {
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
      // Preserve credentials, role, and active status.
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
      createdUsers.push(input.email);
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

  await insertUserIfMissing({
    email: "employee@example.com",
    role: "employee",
    active: true,
    displayName: "Eve Employee",
  });
  await insertUserIfMissing({
    email: "employee-b@example.com",
    role: "employee",
    active: true,
    displayName: "Ben Employee",
  });
  await insertUserIfMissing({
    email: "manager@example.com",
    role: "manager",
    active: true,
    displayName: "Morgan Manager",
  });
  await insertUserIfMissing({
    email: "admin@example.com",
    role: "admin",
    active: true,
    displayName: "Ada Admin",
  });
  await insertUserIfMissing({
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

  const showcase = options.withShowcase
    ? await seedShowcaseWorkload()
    : null;

  return { createdUsers, showcase };
}

if (
  process.argv[1]?.endsWith("seed.ts") ||
  process.argv[1]?.endsWith("seed.js")
) {
  seedDemoUsers({ withShowcase: true })
    .then(async (result) => {
      console.log(
        "Demo seed complete.",
        result.createdUsers.length
          ? `Created: ${result.createdUsers.join(", ")}`
          : "No new users (existing rows preserved).",
      );
      if (result.showcase) {
        console.log(
          `Showcase workload (${result.showcase.month}):`,
          `${result.showcase.entriesInserted} entries inserted,`,
          `${result.showcase.clientsEnsured} clients added.`,
        );
      }
      console.log("Demo password (new users only):", DEMO_SEED_PASSWORD);
      await pool.end();
    })
    .catch(async (error) => {
      console.error(error);
      await pool.end();
      process.exit(1);
    });
}
