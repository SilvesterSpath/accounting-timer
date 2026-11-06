import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  assertTrustedOrigin,
  clearRefreshCookie,
  requireAuth,
  setRefreshCookie,
} from "../auth/plugin.js";
import {
  loginWithPassword,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../auth/session.js";
import { config } from "../config.js";

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function sendAuthPayload(
  reply: import("fastify").FastifyReply,
  result: Awaited<ReturnType<typeof loginWithPassword>>,
) {
  setRefreshCookie(reply, result.refreshToken);
  return {
    accessToken: result.accessToken,
    user: {
      id: result.user.id,
      email: result.user.email,
      role: result.user.role,
      employeeId: result.user.employeeId,
    },
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/auth/login", async (request, reply) => {
    const body = loginBody.parse(request.body);
    const result = await loginWithPassword(body.email, body.password);
    return sendAuthPayload(reply, result);
  });

  app.post("/api/v1/auth/refresh", async (request, reply) => {
    const body = (request.body ?? {}) as { refreshToken?: string };
    const cookieToken = request.cookies[config.cookieName];
    if (cookieToken && body.refreshToken) {
      return reply
        .code(400)
        .send({ error: "Send cookie or body refresh token, not both" });
    }
    const raw = cookieToken ?? body.refreshToken;
    if (!raw) {
      return reply.code(401).send({ error: "Missing refresh token" });
    }
    if (cookieToken) {
      assertTrustedOrigin(request);
    }
    const result = await rotateRefreshToken(raw);
    return sendAuthPayload(reply, result);
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const body = (request.body ?? {}) as { refreshToken?: string };
    const cookieToken = request.cookies[config.cookieName];
    await revokeRefreshToken(cookieToken ?? body.refreshToken);
    clearRefreshCookie(reply);
    return { ok: true };
  });

  app.get("/api/v1/auth/me", async (request) => {
    const user = requireAuth(request);
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId,
    };
  });
}
