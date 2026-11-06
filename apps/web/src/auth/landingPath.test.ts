import assert from "node:assert/strict";
import { test } from "node:test";
import { isOperatorRole, postLoginPath } from "./landingPath.js";

test("postLoginPath sends employees to the workbench", () => {
  assert.equal(postLoginPath("employee"), "/app");
});

test("postLoginPath sends managers and admins to the dashboard", () => {
  assert.equal(postLoginPath("manager"), "/dashboard");
  assert.equal(postLoginPath("admin"), "/dashboard");
});

test("isOperatorRole matches manager and admin only", () => {
  assert.equal(isOperatorRole("employee"), false);
  assert.equal(isOperatorRole("manager"), true);
  assert.equal(isOperatorRole("admin"), true);
});
