import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { employees, refreshSessions, users } from "../db/schema.js";
import { config } from "../config.js";
import type { AuthUser } from "./rbac.js";
import { verifyPassword } from "./passwords.js";
import {
  createRefreshTokenValue,
  hashRefreshToken,
  signAccessToken,
  type AccessClaims,
} from "./tokens.js";
import {
  assertLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
} from "./loginThrottle.js";

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

type RotateOutcome =
  | { ok: true; user: AuthUser }
  | { ok: false; statusCode: number; message: string };

export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, user.id))
    .limit(1);

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    active: user.active,
    employeeId: employee?.id ?? null,
  };
}

export async function loginWithPassword(
  email: string,
  password: string,
  meta: { ip: string } = { ip: "unknown" },
): Promise<{
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}> {
  const normalizedEmail = email.trim().toLowerCase();
  assertLoginAllowed({ ip: meta.ip, email: normalizedEmail });

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    recordLoginFailure({ ip: meta.ip, email: normalizedEmail });
    throw httpError(401, "Invalid email or password");
  }
  if (!user.active) {
    recordLoginFailure({ ip: meta.ip, email: normalizedEmail });
    throw httpError(403, "User is disabled");
  }

  const authUser = await loadAuthUser(user.id);
  if (!authUser) {
    throw httpError(500, "Failed to load user profile");
  }

  recordLoginSuccess({ ip: meta.ip, email: normalizedEmail });

  const refresh = createRefreshTokenValue();
  const expiresAt = new Date(
    Date.now() + config.refreshTokenDays * 24 * 60 * 60 * 1000,
  );
  await db.insert(refreshSessions).values({
    userId: user.id,
    tokenHash: refresh.tokenHash,
    familyId: refresh.familyId,
    expiresAt,
  });

  const accessToken = await signAccessToken({
    sub: user.id,
    role: user.role,
    email: user.email,
  });

  return { accessToken, refreshToken: refresh.token, user: authUser };
}

/**
 * Atomically consumes a refresh token inside a transaction.
 * Concurrent callers with the same token: at most one succeeds;
 * the loser triggers family revocation (reuse signal).
 *
 * Rejection paths that revoke must **return** from the transaction
 * (commit) and only then throw HTTP 401/403 — throwing inside the
 * transaction would roll back the revocation.
 */
export async function rotateRefreshToken(rawToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}> {
  const tokenHash = hashRefreshToken(rawToken);
  const next = createRefreshTokenValue();
  const expiresAt = new Date(
    Date.now() + config.refreshTokenDays * 24 * 60 * 60 * 1000,
  );

  const outcome = await db.transaction(async (tx): Promise<RotateOutcome> => {
    // Lock candidate row(s) for this hash.
    await tx.execute(
      sql`SELECT id FROM refresh_sessions WHERE token_hash = ${tokenHash} FOR UPDATE`,
    );

    const [session] = await tx
      .select()
      .from(refreshSessions)
      .where(eq(refreshSessions.tokenHash, tokenHash))
      .limit(1);

    if (!session) {
      return { ok: false, statusCode: 401, message: "Invalid refresh token" };
    }

    if (session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      // Reuse / expired: revoke the whole family, then commit before 401.
      await tx
        .update(refreshSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshSessions.familyId, session.familyId),
            isNull(refreshSessions.revokedAt),
          ),
        );
      return { ok: false, statusCode: 401, message: "Invalid refresh token" };
    }

    const authUser = await loadAuthUser(session.userId);
    if (!authUser || !authUser.active) {
      await tx
        .update(refreshSessions)
        .set({ revokedAt: new Date() })
        .where(eq(refreshSessions.familyId, session.familyId));
      return {
        ok: false,
        statusCode: authUser && !authUser.active ? 403 : 401,
        message:
          authUser && !authUser.active
            ? "User is disabled"
            : "Invalid refresh token",
      };
    }

    // Atomic consume: only one concurrent updater wins.
    const consumed = await tx
      .update(refreshSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshSessions.id, session.id),
          isNull(refreshSessions.revokedAt),
        ),
      )
      .returning();

    if (!consumed[0]) {
      await tx
        .update(refreshSessions)
        .set({ revokedAt: new Date() })
        .where(eq(refreshSessions.familyId, session.familyId));
      return { ok: false, statusCode: 401, message: "Invalid refresh token" };
    }

    await tx.insert(refreshSessions).values({
      userId: session.userId,
      tokenHash: next.tokenHash,
      familyId: session.familyId,
      expiresAt,
    });

    return { ok: true, user: authUser };
  });

  if (!outcome.ok) {
    throw httpError(outcome.statusCode, outcome.message);
  }

  const accessToken = await signAccessToken({
    sub: outcome.user.id,
    role: outcome.user.role,
    email: outcome.user.email,
  } satisfies AccessClaims);

  return {
    accessToken,
    refreshToken: next.token,
    user: outcome.user,
  };
}

export async function revokeRefreshToken(
  rawToken: string | undefined,
): Promise<void> {
  if (!rawToken) return;
  const tokenHash = hashRefreshToken(rawToken);
  const [session] = await db
    .select()
    .from(refreshSessions)
    .where(eq(refreshSessions.tokenHash, tokenHash))
    .limit(1);
  if (!session) return;
  await db
    .update(refreshSessions)
    .set({ revokedAt: new Date() })
    .where(eq(refreshSessions.familyId, session.familyId));
}
