/**
 * Hard gate for destructive integration tests.
 * Only the disposable Compose test DB is allowed.
 */

const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const REQUIRED_PORT = "5433";
const REQUIRED_DB = "accounting_timer_test";

/** Names that must never appear as the target database. */
const FORBIDDEN_DB_NAMES = new Set([
  "accounting_timer",
  "postgres",
  "template0",
  "template1",
]);

export class UnsafeTestDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeTestDatabaseError";
  }
}

/**
 * Throws unless `databaseUrl` is exactly the isolated loopback test database
 * (host loopback, port 5433, database accounting_timer_test).
 */
export function assertIsolatedTestDatabaseUrl(databaseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new UnsafeTestDatabaseError(
      `Invalid DATABASE_URL for integration tests: ${databaseUrl}`,
    );
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new UnsafeTestDatabaseError(
      `Test DATABASE_URL must use postgres(ql):, got ${parsed.protocol}`,
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    throw new UnsafeTestDatabaseError(
      `Test DATABASE_URL host must be loopback (${[...ALLOWED_HOSTS].join(", ")}), got ${host}`,
    );
  }

  const port = parsed.port || "5432";
  if (port !== REQUIRED_PORT) {
    throw new UnsafeTestDatabaseError(
      `Test DATABASE_URL port must be ${REQUIRED_PORT} (disposable test DB), got ${port}`,
    );
  }

  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, "")).split(
    "/",
  )[0];
  if (!dbName) {
    throw new UnsafeTestDatabaseError(
      "Test DATABASE_URL is missing a database name",
    );
  }
  if (FORBIDDEN_DB_NAMES.has(dbName)) {
    throw new UnsafeTestDatabaseError(
      `Refusing destructive tests against database "${dbName}" (dev/system DB)`,
    );
  }
  if (dbName !== REQUIRED_DB) {
    throw new UnsafeTestDatabaseError(
      `Test DATABASE_URL database must be "${REQUIRED_DB}", got "${dbName}"`,
    );
  }

  // Extra belt: reject obvious non-test naming even if someone renames REQUIRED_DB later.
  if (!/_test$/i.test(dbName)) {
    throw new UnsafeTestDatabaseError(
      `Test database name must end with _test, got "${dbName}"`,
    );
  }
}

export function isIsolatedTestDatabaseUrl(databaseUrl: string): boolean {
  try {
    assertIsolatedTestDatabaseUrl(databaseUrl);
    return true;
  } catch {
    return false;
  }
}
