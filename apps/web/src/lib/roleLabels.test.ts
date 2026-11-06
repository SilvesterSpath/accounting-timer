import assert from "node:assert/strict";
import { test } from "node:test";
import { formatRoleLabel } from "./roleLabels.js";

test("formatRoleLabel maps persisted roles to Hungarian display text", () => {
  assert.equal(formatRoleLabel("employee"), "Munkatárs");
  assert.equal(formatRoleLabel("manager"), "Vezető");
  assert.equal(formatRoleLabel("admin"), "Adminisztrátor");
});
