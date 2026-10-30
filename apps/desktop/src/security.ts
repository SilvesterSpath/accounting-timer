/** Pure security helpers for the Electron PoC — unit-tested without Electron. */

export const APP_SCHEME = "app";
export const APP_HOST = "accounting-timer";
/** Single canonical desktop UI origin. */
export const CANONICAL_APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_INDEX_URL = `${CANONICAL_APP_ORIGIN}/index.html`;

export const ALLOWED_DEV_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
] as const;

export const MAX_FIXTURE_BYTES = 64 * 1024;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * Trusted app:// URLs must use the canonical scheme/host and must not carry
 * a port, username, or password.
 */
export function isCanonicalAppUrl(raw: string): boolean {
  const url = parseUrl(raw);
  if (!url) return false;
  if (url.protocol !== `${APP_SCHEME}:`) return false;
  if (url.hostname !== APP_HOST) return false;
  if (url.port !== "") return false;
  if (url.username !== "" || url.password !== "") return false;
  return true;
}

export function isAllowedDevOrigin(raw: string): boolean {
  const url = parseUrl(raw);
  if (!url) return false;
  // Exact origin match only — rejects lookalikes and path/prefix tricks.
  return (ALLOWED_DEV_ORIGINS as readonly string[]).includes(url.origin);
}

/**
 * Packaged apps always load the canonical app:// index.
 * Dev may use ELECTRON_START_URL only when not packaged and URL is an allowlisted loopback origin.
 */
export function resolveRendererLoadUrl(options: {
  isPackaged: boolean;
  electronStartUrl: string | undefined;
}): { mode: "app" | "dev"; url: string } {
  if (options.isPackaged) {
    return { mode: "app", url: APP_INDEX_URL };
  }

  const raw = options.electronStartUrl?.trim();
  if (!raw) {
    return { mode: "app", url: APP_INDEX_URL };
  }

  const url = parseUrl(raw);
  if (!url) {
    throw new Error(
      `ELECTRON_START_URL is not a valid URL: ${options.electronStartUrl}`,
    );
  }
  if (!(ALLOWED_DEV_ORIGINS as readonly string[]).includes(url.origin)) {
    throw new Error(
      `ELECTRON_START_URL origin not permitted. Allowed: ${ALLOWED_DEV_ORIGINS.join(", ")}`,
    );
  }
  return { mode: "dev", url: raw };
}

export function shouldAttachAppProtocol(options: {
  isPackaged: boolean;
  loadMode: "app" | "dev";
}): boolean {
  // Packaged always uses app://. Unpackaged uses app:// unless loading Vite.
  return options.isPackaged || options.loadMode === "app";
}

/**
 * Validate and normalize API base URL.
 * - http: loopback only
 * - https: allowed for remote
 * Rejects credentials, unsupported schemes, malformed URLs.
 */
export function validateApiBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("apiBaseUrl is empty");
  }

  const url = parseUrl(trimmed);
  if (!url) {
    throw new Error(`apiBaseUrl is not a valid URL: ${raw}`);
  }
  if (url.username || url.password) {
    throw new Error("apiBaseUrl must not contain embedded credentials");
  }
  if (url.protocol === "http:") {
    if (!LOOPBACK_HOSTS.has(url.hostname)) {
      throw new Error(
        `HTTP apiBaseUrl is only allowed for loopback hosts (got ${url.hostname})`,
      );
    }
  } else if (url.protocol !== "https:") {
    throw new Error(
      `Unsupported apiBaseUrl scheme "${url.protocol}" (use http loopback or https)`,
    );
  }

  const path =
    url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host}${path}`;
}

export function apiOriginFromBaseUrl(apiBaseUrl: string): string {
  const validated = validateApiBaseUrl(apiBaseUrl);
  return new URL(validated).origin;
}

export function assertFixturePayload(payload: unknown): {
  fileName: string;
  contents: string;
} {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid fixture payload");
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.fileName !== "string" || typeof record.contents !== "string") {
    throw new Error("Invalid fixture payload fields");
  }
  const bytes = Buffer.byteLength(record.contents, "utf8");
  if (bytes > MAX_FIXTURE_BYTES) {
    throw new Error(
      `Fixture payload too large (${bytes} bytes; max ${MAX_FIXTURE_BYTES})`,
    );
  }
  return {
    fileName: record.fileName,
    contents: record.contents,
  };
}

export function isNavigationAllowed(
  raw: string,
  options: { allowDevOrigins: boolean },
): boolean {
  if (isCanonicalAppUrl(raw)) {
    return true;
  }
  if (options.allowDevOrigins && isAllowedDevOrigin(raw)) {
    return true;
  }
  return false;
}
