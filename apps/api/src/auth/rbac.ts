import type { UserRole } from "@accounting-timer/shared-types";

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  employeeId: string | null;
  active: boolean;
};

type Operation =
  | "time_entries:create_own"
  | "time_entries:list_own"
  | "time_entries:list_others"
  | "time_entries:read_others"
  | "reports:management"
  | "crm:sync"
  | "users:manage";

const matrix: Record<Operation, ReadonlyArray<UserRole>> = {
  "time_entries:create_own": ["employee", "manager", "admin"],
  "time_entries:list_own": ["employee", "manager", "admin"],
  "time_entries:list_others": ["manager", "admin"],
  "time_entries:read_others": ["manager", "admin"],
  "reports:management": ["manager", "admin"],
  "crm:sync": ["admin"],
  "users:manage": ["admin"],
};

export function can(user: AuthUser, operation: Operation): boolean {
  return matrix[operation].includes(user.role);
}

export function assertCan(user: AuthUser, operation: Operation): void {
  if (!can(user, operation)) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }
}
