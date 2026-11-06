import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { employees, users } from "../db/schema.js";
import type { AuthUser } from "../auth/rbac.js";
import { assertCan } from "../auth/rbac.js";

export type EmployeeDto = {
  id: string;
  displayName: string;
  email: string | null;
  active: boolean;
};

export async function listEmployeesForOperator(
  user: AuthUser,
): Promise<EmployeeDto[]> {
  assertCan(user, "time_entries:list_others");

  const rows = await db
    .select({
      id: employees.id,
      displayName: employees.displayName,
      active: employees.active,
      email: users.email,
    })
    .from(employees)
    .leftJoin(users, eq(employees.userId, users.id))
    .orderBy(desc(employees.active), employees.displayName);

  return rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    email: row.email ?? null,
    active: row.active,
  }));
}

/** Exists check for operator inspection — includes inactive employees. */
export async function requireKnownEmployeeId(
  employeeId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!row) {
    throw Object.assign(new Error("Unknown employee"), { statusCode: 404 });
  }
}
