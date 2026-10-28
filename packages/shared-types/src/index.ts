/** Shared contracts for Gate A. Domain DTOs expand in Phase 1+. */

export type UserRole = "employee" | "manager" | "admin";

export interface HealthResponse {
  status: "ok" | "degraded";
  service: "api";
  timestamp: string;
  database: "up" | "down";
  node: string;
}
