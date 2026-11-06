import { config } from "../config.js";

type Bucket = {
  failures: number;
  windowStartedAt: number;
};

const byIp = new Map<string, Bucket>();
const byAccount = new Map<string, Bucket>();

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

function touch(map: Map<string, Bucket>, key: string, now: number): Bucket {
  const existing = map.get(key);
  if (!existing || now - existing.windowStartedAt >= config.loginWindowMs) {
    const fresh = { failures: 0, windowStartedAt: now };
    map.set(key, fresh);
    return fresh;
  }
  return existing;
}

export function assertLoginAllowed(input: {
  ip: string;
  email: string;
  now?: number;
}): void {
  const now = input.now ?? Date.now();
  const emailKey = input.email.trim().toLowerCase();
  const ipBucket = touch(byIp, input.ip || "unknown", now);
  const accountBucket = touch(byAccount, emailKey, now);

  if (
    ipBucket.failures >= config.loginMaxFailures ||
    accountBucket.failures >= config.loginMaxFailures
  ) {
    throw httpError(429, "Too many login attempts. Try again later.");
  }
}

export function recordLoginFailure(input: {
  ip: string;
  email: string;
  now?: number;
}): void {
  const now = input.now ?? Date.now();
  const emailKey = input.email.trim().toLowerCase();
  const ipBucket = touch(byIp, input.ip || "unknown", now);
  const accountBucket = touch(byAccount, emailKey, now);
  ipBucket.failures += 1;
  accountBucket.failures += 1;
}

export function recordLoginSuccess(input: {
  ip: string;
  email: string;
}): void {
  byIp.delete(input.ip || "unknown");
  byAccount.delete(input.email.trim().toLowerCase());
}

/** Test helper */
export function resetLoginThrottleForTests(): void {
  byIp.clear();
  byAccount.clear();
}
