import assert from "node:assert/strict";
import { test } from "node:test";
import { can, type AuthUser } from "./rbac.js";

function user(role: AuthUser["role"]): AuthUser {
  return {
    id: "u1",
    email: `${role}@example.com`,
    role,
    employeeId: "e1",
    active: true,
  };
}

test("employee cannot list others entries or sync CRM", () => {
  const employee = user("employee");
  assert.equal(can(employee, "time_entries:list_own"), true);
  assert.equal(can(employee, "time_entries:list_others"), false);
  assert.equal(can(employee, "crm:sync"), false);
  assert.equal(can(employee, "reports:management"), false);
});

test("manager can read others and management reports", () => {
  const manager = user("manager");
  assert.equal(can(manager, "time_entries:list_others"), true);
  assert.equal(can(manager, "reports:management"), true);
  assert.equal(can(manager, "crm:sync"), false);
});

test("admin can sync CRM", () => {
  assert.equal(can(user("admin"), "crm:sync"), true);
});
