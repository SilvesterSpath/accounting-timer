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

export function resolveListenPort(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.PORT ?? env.API_PORT ?? "3001";
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT/API_PORT: ${raw}`);
  }
  return port;
}

export function resolveListenHost(
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.API_HOST?.trim()) {
    return env.API_HOST.trim();
  }
  return env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
}

/** Railway edge is one hop — enable only when TRUST_PROXY=1. */
export function resolveTrustProxy(
  env: NodeJS.ProcessEnv = process.env,
): false | ((address: string, hop: number) => boolean) {
  if (env.TRUST_PROXY !== "1") return false;
  return (_address: string, hop: number) => hop < 1;
}

export function resolveWebDistDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    env.WEB_DIST_DIR?.trim() ||
    resolve(process.cwd(), "../web/dist")
  );
}

export const config = {
  host: resolveListenHost(),
  port: resolveListenPort(),
  trustProxy: resolveTrustProxy(),
  webDistDir: resolveWebDistDir(),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://accounting:accounting@127.0.0.1:5432/accounting_timer",
  corsOrigins: parseCorsOrigins(),
  jwtSecret: resolveJwtSecret(),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS ?? "14"),
  cookieName: process.env.REFRESH_COOKIE_NAME ?? "at_refresh",
  isProd: process.env.NODE_ENV === "production",
  demoBootstrap: process.env.DEMO_BOOTSTRAP === "1",
  loginMaxFailures: Number(process.env.LOGIN_MAX_FAILURES ?? "5"),
  loginWindowMs: Number(process.env.LOGIN_WINDOW_MS ?? String(15 * 60 * 1000)),
};
