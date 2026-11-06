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

/** Directory row for operator timesheet inspection (manager/admin). */
export interface EmployeeDto {
  id: string;
  displayName: string;
  email: string | null;
  active: boolean;
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
  /** When set, totals are for this employee's personal sheet (operator inspection). */
  employeeId?: string;
  workDate?: string;
  month?: string;
  totalMinutes: number;
  totalHoursDisplay: number;
  entryCount: number;
}

/** Operator management dashboard — monthly totals grouped by client. */
export interface ManagementClientWorkloadDto {
  month: string;
  totalMinutes: number;
  totalHoursDisplay: number;
  entryCount: number;
  /** Active external clients only (active=true and not system-internal). */
  activeClientCount: number;
  byClient: Array<{
    clientId: string;
    name: string;
    isSystemInternal: boolean;
    totalMinutes: number;
    totalHoursDisplay: number;
    entryCount: number;
  }>;
}
