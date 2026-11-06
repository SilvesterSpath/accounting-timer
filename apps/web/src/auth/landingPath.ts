import type { UserRole } from "@accounting-timer/shared-types";

/** Post-login landing: employees → workbench; operators → management dashboard. */
export function postLoginPath(role: UserRole): string {
  return role === "employee" ? "/app" : "/dashboard";
}

export function isOperatorRole(role: string): boolean {
  return role === "manager" || role === "admin";
}
