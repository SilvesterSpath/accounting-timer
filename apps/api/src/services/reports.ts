import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { timeEntries } from "../db/schema.js";
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
