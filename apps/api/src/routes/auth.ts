import type { FastifyInstance, FastifyRequest } from "fastify";
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

/**
 * Login response shape: body refresh for canonical Electron Origin only (T03).
 * Refresh/logout still select transport from which credential is present.
 */
export function usesBodyRefreshTransport(
  request: FastifyRequest,
): boolean {
  const origin = request.headers.origin;
  return (
    origin === "app://accounting-timer" &&
    config.corsOrigins.includes(origin)
  );
}

function userDto(result: Awaited<ReturnType<typeof loginWithPassword>>) {
  return {
    id: result.user.id,
    email: result.user.email,
    role: result.user.role,
    employeeId: result.user.employeeId,
  };
}

function sendAuthPayload(
  request: FastifyRequest,
  reply: import("fastify").FastifyReply,
  result: Awaited<ReturnType<typeof loginWithPassword>>,
) {
  if (usesBodyRefreshTransport(request)) {
    // Electron: refresh in JSON body only — do not set browser cookie.
    clearRefreshCookie(reply);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: userDto(result),
    };
  }

  // Browser: httpOnly cookie only — never put refresh token in JSON body.
  setRefreshCookie(reply, result.refreshToken);
  return {
    accessToken: result.accessToken,
    user: userDto(result),
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/auth/login", async (request, reply) => {
    const body = loginBody.parse(request.body);
    const result = await loginWithPassword(body.email, body.password, {
      ip: request.ip,
    });
    return sendAuthPayload(request, reply, result);
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
    return sendAuthPayload(request, reply, result);
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const body = (request.body ?? {}) as { refreshToken?: string };
    const cookieToken = request.cookies[config.cookieName];
    if (cookieToken && body.refreshToken) {
      return reply
        .code(400)
        .send({ error: "Send cookie or body refresh token, not both" });
    }
    if (cookieToken) {
      assertTrustedOrigin(request);
    }
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
