import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

export async function checkDatabase(): Promise<"up" | "down"> {
  try {
    await pool.query("SELECT 1");
    return "up";
  } catch {
    return "down";
  }
}
