import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  resetLoginThrottleForTests,
} from "./loginThrottle.js";

test("login throttle blocks after max failures per account", () => {
  resetLoginThrottleForTests();
  const email = "throttle-account@example.com";
  const ip = "10.0.0.1";
  const now = Date.now();

  for (let i = 0; i < 5; i += 1) {
    assertLoginAllowed({ ip, email, now });
    recordLoginFailure({ ip, email, now });
  }

  assert.throws(
    () => assertLoginAllowed({ ip, email, now }),
    (error: unknown) =>
      error instanceof Error &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 429,
  );

  recordLoginSuccess({ ip, email });
  assert.doesNotThrow(() => assertLoginAllowed({ ip, email, now }));
});

test("login throttle blocks after max failures per IP", () => {
  resetLoginThrottleForTests();
  const ip = "10.0.0.2";
  const now = Date.now();

  for (let i = 0; i < 5; i += 1) {
    const email = `user${i}@example.com`;
    assertLoginAllowed({ ip, email, now });
    recordLoginFailure({ ip, email, now });
  }

  assert.throws(
    () => assertLoginAllowed({ ip, email: "another@example.com", now }),
    (error: unknown) =>
      error instanceof Error &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 429,
  );
});
