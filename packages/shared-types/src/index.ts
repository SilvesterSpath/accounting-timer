/** Shared contracts for Gate A. */

export type UserRole = "employee" | "manager" | "admin";

export interface HealthResponse {
  status: "ok" | "degraded";
  service: "api";
  timestamp: string;
  database: "up" | "down";
  node: string;
}

export interface AuthUserDto {
  id: string;
  email: string;
  role: UserRole;
  employeeId: string | null;
}

export interface ClientDto {
  id: string;
  name: string;
  externalId: string;
  sourceSystem: string;
  isSystemInternal: boolean;
}

export interface ActivityDto {
  id: string;
  code: string;
  name: string;
  isInternal: boolean;
}

export interface TimeEntryDto {
  id: string;
  employeeId: string;
  clientId: string;
  activityId: string;
  workDate: string;
  durationMinutes: number;
  description: string | null;
  version: number;
  source: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SummaryReportDto {
  scope: "own" | "management";
  workDate?: string;
  month?: string;
  totalMinutes: number;
  totalHoursDisplay: number;
  entryCount: number;
}
