import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../config.js";

export type AccessClaims = {
  sub: string;
  role: "employee" | "manager" | "admin";
  email: string;
};

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createRefreshTokenValue(): {
  token: string;
  tokenHash: string;
  familyId: string;
} {
  const token = randomBytes(48).toString("base64url");
  return {
    token,
    tokenHash: hashRefreshToken(token),
    familyId: randomUUID(),
  };
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  const secret = new TextEncoder().encode(config.jwtSecret);
  return new SignJWT({ role: claims.role, email: claims.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(config.accessTokenTtl)
    .sign(secret);
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessClaims | null> {
  try {
    const secret = new TextEncoder().encode(config.jwtSecret);
    const { payload } = await jwtVerify(token, secret);
    if (
      typeof payload.sub !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.email !== "string"
    ) {
      return null;
    }
    if (
      payload.role !== "employee" &&
      payload.role !== "manager" &&
      payload.role !== "admin"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      role: payload.role,
      email: payload.email,
    };
  } catch {
    return null;
  }
}
