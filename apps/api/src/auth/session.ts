import { and, eq, isNull } from "drizzle-orm";
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

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

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
): Promise<{
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw httpError(401, "Invalid email or password");
  }
  if (!user.active) {
    throw httpError(403, "User is disabled");
  }

  const authUser = await loadAuthUser(user.id);
  if (!authUser) {
    throw httpError(500, "Failed to load user profile");
  }

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

export async function rotateRefreshToken(rawToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}> {
  const tokenHash = hashRefreshToken(rawToken);
  const [session] = await db
    .select()
    .from(refreshSessions)
    .where(eq(refreshSessions.tokenHash, tokenHash))
    .limit(1);

  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
    if (session) {
      await db
        .update(refreshSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshSessions.familyId, session.familyId),
            isNull(refreshSessions.revokedAt),
          ),
        );
    }
    throw httpError(401, "Invalid refresh token");
  }

  const authUser = await loadAuthUser(session.userId);
  if (!authUser) {
    throw httpError(401, "Invalid refresh token");
  }
  if (!authUser.active) {
    await db
      .update(refreshSessions)
      .set({ revokedAt: new Date() })
      .where(eq(refreshSessions.familyId, session.familyId));
    throw httpError(403, "User is disabled");
  }

  const next = createRefreshTokenValue();
  const expiresAt = new Date(
    Date.now() + config.refreshTokenDays * 24 * 60 * 60 * 1000,
  );

  await db.transaction(async (tx) => {
    await tx
      .update(refreshSessions)
      .set({ revokedAt: new Date() })
      .where(eq(refreshSessions.id, session.id));
    await tx.insert(refreshSessions).values({
      userId: session.userId,
      tokenHash: next.tokenHash,
      familyId: session.familyId,
      expiresAt,
    });
  });

  const accessToken = await signAccessToken({
    sub: authUser.id,
    role: authUser.role,
    email: authUser.email,
  } satisfies AccessClaims);

  return { accessToken, refreshToken: next.token, user: authUser };
}

export async function revokeRefreshToken(rawToken: string | undefined): Promise<void> {
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
