import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "../api/client.js";
import { formatApiErrorHu } from "./apiErrorHu.js";

test("formatApiErrorHu translates known API errors", () => {
  assert.equal(
    formatApiErrorHu(new ApiError("Forbidden", 403), "fallback"),
    "Nincs jogosultsága ehhez a művelethez",
  );
  assert.equal(
    formatApiErrorHu(new ApiError("month must be YYYY-MM", 400), "fallback"),
    "A hónap formátuma érvénytelen (ÉÉÉÉ-HH)",
  );
});

test("formatApiErrorHu uses fallback for network-style failures", () => {
  assert.equal(
    formatApiErrorHu(new Error("Failed to fetch"), "Hálózati hiba"),
    "Hálózati hiba",
  );
});
