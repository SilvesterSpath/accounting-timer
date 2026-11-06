import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REFRESH_FILE = "accounting-timer.refreshToken.bin";

function storePath(): string {
  return join(app.getPath("userData"), REFRESH_FILE);
}

/** Persist refresh token via OS-backed safeStorage. Never log token values. */
export function isSecureStoreAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function saveRefreshToken(token: string): void {
  if (!token) {
    throw new Error("Cannot store empty refresh token");
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("safeStorage encryption is not available on this host");
  }
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  writeFileSync(storePath(), safeStorage.encryptString(token));
}

export function loadRefreshToken(): string | null {
  if (!safeStorage.isEncryptionAvailable()) {
    return null;
  }
  const file = storePath();
  if (!existsSync(file)) {
    return null;
  }
  try {
    return safeStorage.decryptString(readFileSync(file));
  } catch {
    return null;
  }
}

export function clearRefreshToken(): void {
  const file = storePath();
  if (existsSync(file)) {
    unlinkSync(file);
  }
}
