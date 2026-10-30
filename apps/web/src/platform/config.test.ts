import assert from "node:assert/strict";
import { test } from "node:test";
import { apiUrl } from "./config.js";

test("apiUrl uses relative paths for web same-origin", () => {
  assert.equal(
    apiUrl("/api/v1/health", { apiBaseUrl: "", appMode: "web" }),
    "/api/v1/health",
  );
});

test("apiUrl joins absolute desktop API base", () => {
  assert.equal(
    apiUrl("/api/v1/health", {
      apiBaseUrl: "http://127.0.0.1:3001",
      appMode: "desktop",
    }),
    "http://127.0.0.1:3001/api/v1/health",
  );
});
