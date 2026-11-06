import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { clients, timeEntries } from "../db/schema.js";
import type { AuthUser } from "../auth/rbac.js";
import { assertCan } from "../auth/rbac.js";
import { minutesToDisplayHours, monthBounds } from "../lib/duration.js";
import { requireKnownEmployeeId } from "./employees.js";

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

export type SummaryReport = {
  scope: "own" | "management";
  employeeId?: string;
  workDate?: string;
  month?: string;
  totalMinutes: number;
  totalHoursDisplay: number;
  entryCount: number;
};

async function resolvePersonalEmployeeId(
  user: AuthUser,
  requestedEmployeeId?: string,
): Promise<string> {
  if (!requestedEmployeeId || requestedEmployeeId === user.employeeId) {
    if (!user.employeeId) {
      throw httpError(400, "Authenticated user has no employee profile");
    }
    return user.employeeId;
  }
  assertCan(user, "time_entries:list_others");
  await requireKnownEmployeeId(requestedEmployeeId);
  return requestedEmployeeId;
}

export async function getDailySummary(
  user: AuthUser,
  workDate: string,
  options: { employeeId?: string } = {},
): Promise<SummaryReport> {
  assertCan(user, "time_entries:list_own");
  const employeeId = await resolvePersonalEmployeeId(user, options.employeeId);

  const [row] = await db
    .select({
      totalMinutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`,
      entryCount: sql<number>`count(*)::int`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.employeeId, employeeId),
        eq(timeEntries.workDate, workDate),
        eq(timeEntries.isCurrent, true),
        isNull(timeEntries.deletedAt),
      ),
    );

  const totalMinutes = Number(row?.totalMinutes ?? 0);
  return {
    scope: "own",
    employeeId,
    workDate,
    totalMinutes,
    totalHoursDisplay: minutesToDisplayHours(totalMinutes),
    entryCount: Number(row?.entryCount ?? 0),
  };
}

export async function getMonthlySummary(
  user: AuthUser,
  month: string,
  options: { management?: boolean; employeeId?: string } = {},
): Promise<SummaryReport> {
  const { start, endExclusive } = monthBounds(month);

  if (options.management) {
    assertCan(user, "reports:management");
    const [row] = await db
      .select({
        totalMinutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`,
        entryCount: sql<number>`count(*)::int`,
      })
      .from(timeEntries)
      .where(
        and(
          gte(timeEntries.workDate, start),
          lt(timeEntries.workDate, endExclusive),
          eq(timeEntries.isCurrent, true),
          isNull(timeEntries.deletedAt),
        ),
      );

    const totalMinutes = Number(row?.totalMinutes ?? 0);
    return {
      scope: "management",
      month,
      totalMinutes,
      totalHoursDisplay: minutesToDisplayHours(totalMinutes),
      entryCount: Number(row?.entryCount ?? 0),
    };
  }

  assertCan(user, "time_entries:list_own");
  const employeeId = await resolvePersonalEmployeeId(user, options.employeeId);

  const [row] = await db
    .select({
      totalMinutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`,
      entryCount: sql<number>`count(*)::int`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.employeeId, employeeId),
        gte(timeEntries.workDate, start),
        lt(timeEntries.workDate, endExclusive),
        eq(timeEntries.isCurrent, true),
        isNull(timeEntries.deletedAt),
      ),
    );

  const totalMinutes = Number(row?.totalMinutes ?? 0);
  return {
    scope: "own",
    employeeId,
    month,
    totalMinutes,
    totalHoursDisplay: minutesToDisplayHours(totalMinutes),
    entryCount: Number(row?.entryCount ?? 0),
  };
}

export type ManagementClientWorkload = {
  month: string;
  totalMinutes: number;
  totalHoursDisplay: number;
  entryCount: number;
  activeClientCount: number;
  byClient: Array<{
    clientId: string;
    name: string;
    isSystemInternal: boolean;
    totalMinutes: number;
    totalHoursDisplay: number;
    entryCount: number;
  }>;
};

/** Reject missing/malformed reporting months with HTTP 400 (incl. 2026-13). */
export function requireReportingMonth(month: string | undefined): string {
  if (!month || typeof month !== "string") {
    throw httpError(400, "month must be YYYY-MM");
  }
  try {
    monthBounds(month);
  } catch {
    throw httpError(400, "month must be YYYY-MM");
  }
  return month;
}

/**
 * Operator dashboard: month totals + time grouped by client.
 * Headline totals are summed from the same grouped rows as the breakdown so
 * concurrent writes cannot make the card and chart disagree.
 * Internal (system) clients are returned with isSystemInternal=true so the UI
 * can label them explicitly rather than treating them as ordinary clients.
 * activeClientCount counts active external clients only (excludes system-internal).
 */
export async function getManagementClientWorkload(
  user: AuthUser,
  month: string,
): Promise<ManagementClientWorkload> {
  assertCan(user, "reports:management");
  const reportingMonth = requireReportingMonth(month);
  const { start, endExclusive } = monthBounds(reportingMonth);

  const [activeClients] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(clients)
    .where(
      and(eq(clients.active, true), eq(clients.isSystemInternal, false)),
    );

  const grouped = await db
    .select({
      clientId: clients.id,
      name: clients.name,
      isSystemInternal: clients.isSystemInternal,
      totalMinutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`,
      entryCount: sql<number>`count(*)::int`,
    })
    .from(timeEntries)
    .innerJoin(clients, eq(timeEntries.clientId, clients.id))
    .where(
      and(
        gte(timeEntries.workDate, start),
        lt(timeEntries.workDate, endExclusive),
        eq(timeEntries.isCurrent, true),
        isNull(timeEntries.deletedAt),
      ),
    )
    .groupBy(clients.id, clients.name, clients.isSystemInternal)
    .orderBy(desc(sql`sum(${timeEntries.durationMinutes})`));

  const byClient = grouped.map((row) => {
    const minutes = Number(row.totalMinutes ?? 0);
    return {
      clientId: row.clientId,
      name: row.name,
      isSystemInternal: row.isSystemInternal,
      totalMinutes: minutes,
      totalHoursDisplay: minutesToDisplayHours(minutes),
      entryCount: Number(row.entryCount ?? 0),
    };
  });

  const totalMinutes = byClient.reduce((sum, row) => sum + row.totalMinutes, 0);
  const entryCount = byClient.reduce((sum, row) => sum + row.entryCount, 0);

  return {
    month: reportingMonth,
    totalMinutes,
    totalHoursDisplay: minutesToDisplayHours(totalMinutes),
    entryCount,
    activeClientCount: Number(activeClients?.count ?? 0),
    byClient,
  };
}
