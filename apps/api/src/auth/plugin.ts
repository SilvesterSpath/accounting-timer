import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { config } from "../config.js";
import type { AuthUser } from "./rbac.js";
import { loadAuthUser } from "./session.js";
import { verifyAccessToken } from "./tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthUser | null;
  }
}

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

export function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    path: "/api/v1/auth",
    maxAge: config.refreshTokenDays * 24 * 60 * 60,
  });
}

export function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(config.cookieName, { path: "/api/v1/auth" });
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.decorateRequest("authUser", null);

  app.addHook("preHandler", async (request) => {
    request.authUser = null;
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return;
    const token = header.slice("Bearer ".length).trim();
    if (!token) return;
    const claims = await verifyAccessToken(token);
    if (!claims) return;
    const user = await loadAuthUser(claims.sub);
    if (!user) return;
    if (!user.active) {
      throw httpError(403, "User is disabled");
    }
    request.authUser = user;
  });
}

export function requireAuth(request: FastifyRequest): AuthUser {
  if (!request.authUser) {
    throw httpError(401, "Unauthorized");
  }
  return request.authUser;
}

/** Cookie refresh endpoints must present a trusted Origin (CSRF mitigation). */
export function assertTrustedOrigin(request: FastifyRequest): void {
  const origin = request.headers.origin;
  if (!origin) {
    // Same-origin navigations may omit Origin; require it for cookie refresh POSTs.
    throw httpError(403, "Missing Origin");
  }
  if (!config.corsOrigins.includes(origin)) {
    throw httpError(403, "Untrusted Origin");
  }
}
