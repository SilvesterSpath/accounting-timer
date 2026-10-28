import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), "../../.env"), quiet: true });
loadEnv({ quiet: true });

export const config = {
  host: process.env.API_HOST ?? "127.0.0.1",
  port: Number(process.env.API_PORT ?? "3001"),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://accounting:accounting@127.0.0.1:5432/accounting_timer",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
};
