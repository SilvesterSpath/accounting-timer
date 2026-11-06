/**
 * Preload for API tests: force isolated test database.
 * Never points at the default development DB on :5432.
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-phase1";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://accounting:accounting@127.0.0.1:5433/accounting_timer_test";
