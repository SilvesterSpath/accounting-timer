import { buildApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";

const app = await buildApp();

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`API listening on http://${config.host}:${config.port}`);
} catch (error) {
  app.log.error(error);
  await pool.end();
  process.exit(1);
}

async function shutdown() {
  await app.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
