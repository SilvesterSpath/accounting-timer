import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), "../../.env"), quiet: true });
loadEnv({ quiet: true });

const defaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  // Electron custom protocol origins used by this PoC
  "app://-",
  "app://accounting-timer",
];

function parseCorsOrigins(): string[] {
  const fromList = process.env.CORS_ORIGINS;
  if (fromList && fromList.trim()) {
    return fromList
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  const single = process.env.CORS_ORIGIN;
  if (single && single.trim()) {
    return [single.trim(), ...defaultOrigins.filter((o) => o !== single.trim())];
  }
  return defaultOrigins;
}

export const config = {
  host: process.env.API_HOST ?? "127.0.0.1",
  port: Number(process.env.API_PORT ?? "3001"),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://accounting:accounting@127.0.0.1:5432/accounting_timer",
  corsOrigins: parseCorsOrigins(),
};
