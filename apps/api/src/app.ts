import Fastify from "fastify";
import type { HealthResponse } from "@accounting-timer/shared-types";
import { config } from "./config.js";
import { checkDatabase } from "./db.js";

export async function buildApp() {
  const app = Fastify({ logger: true });
  const allowed = new Set(config.corsOrigins);

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && allowed.has(origin)) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Credentials", "true");
      reply.header("Vary", "Origin");
      reply.header(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      reply.header(
        "Access-Control-Allow-Methods",
        "GET,POST,PATCH,DELETE,OPTIONS",
      );
    }
    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });

  app.get("/api/v1/health", async (): Promise<HealthResponse> => {
    const database = await checkDatabase();
    return {
      status: database === "up" ? "ok" : "degraded",
      service: "api",
      timestamp: new Date().toISOString(),
      database,
      node: process.version,
    };
  });

  return app;
}
