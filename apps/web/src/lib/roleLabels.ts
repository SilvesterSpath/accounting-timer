import type { UserRole } from "@accounting-timer/shared-types";

/** Hungarian display labels; persisted role identifiers stay English. */
export function formatRoleLabel(role: UserRole | string): string {
  switch (role) {
    case "employee":
      return "Munkatárs";
    case "manager":
      return "Vezető";
    case "admin":
      return "Adminisztrátor";
    default:
      return role;
  }
}
