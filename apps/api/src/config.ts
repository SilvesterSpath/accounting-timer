import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), "../../.env"), quiet: true });
loadEnv({ quiet: true });

/** Development defaults — replaced entirely when CORS_ORIGINS is set. */
export const DEFAULT_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "app://accounting-timer",
] as const;

export function parseCorsOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const fromList = env.CORS_ORIGINS;
  if (fromList && fromList.trim()) {
    return fromList
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  const single = env.CORS_ORIGIN;
  if (single && single.trim()) {
    return [single.trim()];
  }
  return [...DEFAULT_CORS_ORIGINS];
}

const DEV_JWT_FALLBACK = "dev-only-change-me-accounting-timer-gate-a";

export function resolveJwtSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.JWT_SECRET?.trim();
  if (configured) return configured;
  if (env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET must be set in production (no hardcoded fallback)",
    );
  }
  return DEV_JWT_FALLBACK;
}

export const config = {
  host: envHost(),
  port: Number(process.env.API_PORT ?? "3001"),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://accounting:accounting@127.0.0.1:5432/accounting_timer",
  corsOrigins: parseCorsOrigins(),
  jwtSecret: resolveJwtSecret(),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS ?? "14"),
  cookieName: process.env.REFRESH_COOKIE_NAME ?? "at_refresh",
  isProd: process.env.NODE_ENV === "production",
  loginMaxFailures: Number(process.env.LOGIN_MAX_FAILURES ?? "5"),
  loginWindowMs: Number(process.env.LOGIN_WINDOW_MS ?? String(15 * 60 * 1000)),
};

function envHost(): string {
  return process.env.API_HOST ?? "127.0.0.1";
}
