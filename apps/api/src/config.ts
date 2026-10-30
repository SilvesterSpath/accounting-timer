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
    // Explicit deployment config replaces defaults (does not extend them).
    return fromList
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  const single = env.CORS_ORIGIN;
  if (single && single.trim()) {
    // Legacy single-origin override also replaces the full default set.
    return [single.trim()];
  }
  return [...DEFAULT_CORS_ORIGINS];
}

export const config = {
  host: envHost(),
  port: Number(process.env.API_PORT ?? "3001"),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://accounting:accounting@127.0.0.1:5432/accounting_timer",
  corsOrigins: parseCorsOrigins(),
};

function envHost(): string {
  return process.env.API_HOST ?? "127.0.0.1";
}
