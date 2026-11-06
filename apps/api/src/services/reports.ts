import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { timeEntries } from "../db/schema.js";
import type { AuthUser } from "../auth/rbac.js";
import { assertCan } from "../auth/rbac.js";
import { minutesToDisplayHours, monthBounds } from "../lib/duration.js";

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

export type SummaryReport = {
  scope: "own" | "management";
  workDate?: string;
  month?: string;
  totalMinutes: number;
  totalHoursDisplay: number;
  entryCount: number;
};

export async function getDailySummary(
  user: AuthUser,
  workDate: string,
): Promise<SummaryReport> {
  if (!user.employeeId) {
    throw httpError(400, "Authenticated user has no employee profile");
  }
  assertCan(user, "time_entries:list_own");

  const [row] = await db
    .select({
      totalMinutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`,
      entryCount: sql<number>`count(*)::int`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.employeeId, user.employeeId),
        eq(timeEntries.workDate, workDate),
        eq(timeEntries.isCurrent, true),
        isNull(timeEntries.deletedAt),
      ),
    );

  const totalMinutes = Number(row?.totalMinutes ?? 0);
  return {
    scope: "own",
    workDate,
    totalMinutes,
    totalHoursDisplay: minutesToDisplayHours(totalMinutes),
    entryCount: Number(row?.entryCount ?? 0),
  };
}

export async function getMonthlySummary(
  user: AuthUser,
  month: string,
  options: { management?: boolean } = {},
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

  if (!user.employeeId) {
    throw httpError(400, "Authenticated user has no employee profile");
  }
  assertCan(user, "time_entries:list_own");

  const [row] = await db
    .select({
      totalMinutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`,
      entryCount: sql<number>`count(*)::int`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.employeeId, user.employeeId),
        gte(timeEntries.workDate, start),
        lt(timeEntries.workDate, endExclusive),
        eq(timeEntries.isCurrent, true),
        isNull(timeEntries.deletedAt),
      ),
    );

  const totalMinutes = Number(row?.totalMinutes ?? 0);
  return {
    scope: "own",
    month,
    totalMinutes,
    totalHoursDisplay: minutesToDisplayHours(totalMinutes),
    entryCount: Number(row?.entryCount ?? 0),
  };
}
