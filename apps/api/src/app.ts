import Fastify from "fastify";
import cookie from "@fastify/cookie";
import type { HealthResponse } from "@accounting-timer/shared-types";
import { config } from "./config.js";
import { checkDatabase } from "./db.js";
import { registerAuth } from "./auth/plugin.js";
import { authRoutes } from "./routes/auth.js";
import { domainRoutes } from "./routes/domain.js";
import { registerStaticSite } from "./web/staticSite.js";

export type BuildAppOptions = {
  /** Override DB probe for readiness/health tests. */
  checkDatabase?: () => Promise<"up" | "down">;
  /** Skip static UI registration (API-only tests). */
  serveStatic?: boolean;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const probe = options.checkDatabase ?? checkDatabase;
  const app = Fastify({
    logger: true,
    trustProxy: config.trustProxy,
  });
  const allowed = new Set(config.corsOrigins);

  await app.register(cookie);

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

  app.setErrorHandler((error, _request, reply) => {
    const statusCode =
      typeof error === "object" &&
      error &&
      "statusCode" in error &&
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : error instanceof Error && error.name === "ZodError"
          ? 400
          : 500;
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    if (statusCode >= 500) {
      app.log.error(error);
    }
    reply.code(statusCode).send({ error: message });
  });

  await registerAuth(app);
  await authRoutes(app);
  await domainRoutes(app);

  app.get("/api/v1/health", async (request): Promise<HealthResponse> => {
    request.log.info(
      { origin: request.headers.origin ?? null },
      "health origin",
    );
    const database = await probe();
    return {
      status: database === "up" ? "ok" : "degraded",
      service: "api",
      timestamp: new Date().toISOString(),
      database,
      node: process.version,
    };
  });

  app.get("/api/v1/ready", async (_request, reply) => {
    const database = await probe();
    if (database !== "up") {
      return reply.code(503).send({
        status: "not_ready",
        database,
        timestamp: new Date().toISOString(),
      });
    }
    return {
      status: "ready",
      database,
      timestamp: new Date().toISOString(),
    };
  });

  // Register after API routes so /api always wins.
  if (options.serveStatic !== false) {
    await registerStaticSite(app, config.webDistDir);
  }

  return app;
}
