import { buildApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { applyMigrations } from "./db/migrate.js";
import { runDemoBootstrap } from "./db/demoBootstrap.js";

await applyMigrations();

if (config.demoBootstrap) {
  const result = await runDemoBootstrap();
  console.info(
    JSON.stringify({
      msg: "demo bootstrap complete",
      createdUsers: result.createdUsers,
      crmSynced: result.crmSynced,
      upsertedClients: result.upsertedClients,
      operatorUserId: result.operatorUserId,
      // Never log passwords.
    }),
  );
}

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
