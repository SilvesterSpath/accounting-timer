import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { activities, clients, timeEntries } from "../db/schema.js";
import type { AuthUser } from "../auth/rbac.js";
import { assertCan, can } from "../auth/rbac.js";
import { assertDurationMinutes } from "../lib/duration.js";
import { writeAudit } from "./audit.js";

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

export type TimeEntryDto = {
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
};

function toDto(row: typeof timeEntries.$inferSelect): TimeEntryDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    clientId: row.clientId,
    activityId: row.activityId,
    workDate: row.workDate,
    durationMinutes: row.durationMinutes,
    description: row.description,
    version: row.version,
    source: row.source,
    isCurrent: row.isCurrent,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function requireOwnEmployee(user: AuthUser): Promise<string> {
  if (!user.employeeId) {
    throw httpError(400, "Authenticated user has no employee profile");
  }
  return user.employeeId;
}

export async function listTimeEntries(
  user: AuthUser,
  query: { employeeId?: string; workDate?: string },
): Promise<TimeEntryDto[]> {
  assertCan(user, "time_entries:list_own");
  const ownEmployeeId = await requireOwnEmployee(user);

  let employeeFilter = ownEmployeeId;
  if (query.employeeId && query.employeeId !== ownEmployeeId) {
    assertCan(user, "time_entries:list_others");
    employeeFilter = query.employeeId;
  }

  const conditions = [
    eq(timeEntries.employeeId, employeeFilter),
    eq(timeEntries.isCurrent, true),
    isNull(timeEntries.deletedAt),
  ];
  if (query.workDate) {
    conditions.push(eq(timeEntries.workDate, query.workDate));
  }

  const rows = await db
    .select()
    .from(timeEntries)
    .where(and(...conditions))
    .orderBy(desc(timeEntries.workDate), desc(timeEntries.createdAt));

  return rows.map(toDto);
}

export async function createTimeEntry(
  user: AuthUser,
  input: {
    clientId: string;
    activityId: string;
    workDate: string;
    durationMinutes: number;
    description?: string;
  },
): Promise<TimeEntryDto> {
  assertCan(user, "time_entries:create_own");
  const employeeId = await requireOwnEmployee(user);
  const durationMinutes = assertDurationMinutes(input.durationMinutes);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) {
    throw httpError(400, "workDate must be YYYY-MM-DD");
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, input.clientId))
    .limit(1);
  if (!client || !client.active) {
    throw httpError(400, "Unknown or inactive client");
  }

  const [activity] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, input.activityId))
    .limit(1);
  if (!activity || !activity.active) {
    throw httpError(400, "Unknown or inactive activity");
  }

  return db.transaction(async (tx) => {
    const createdRows = await tx
      .insert(timeEntries)
      .values({
        employeeId,
        clientId: input.clientId,
        activityId: input.activityId,
        workDate: input.workDate,
        durationMinutes,
        description: input.description?.trim() || null,
        version: 1,
        source: "manual",
        isCurrent: true,
      })
      .returning();
    const created = createdRows[0];
    if (!created) {
      throw httpError(500, "Failed to create time entry");
    }

    await writeAudit(tx, {
      actorUserId: user.id,
      entityType: "time_entry",
      entityId: created.id,
      action: "insert",
      afterState: created,
    });

    return toDto(created);
  });
}

export async function getTimeEntry(
  user: AuthUser,
  id: string,
): Promise<TimeEntryDto> {
  const [row] = await db
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.id, id))
    .limit(1);
  if (!row || row.deletedAt || !row.isCurrent) {
    throw httpError(404, "Time entry not found");
  }

  const ownEmployeeId = await requireOwnEmployee(user);
  if (row.employeeId !== ownEmployeeId && !can(user, "time_entries:read_others")) {
    throw httpError(403, "Forbidden");
  }
  return toDto(row);
}

export async function patchTimeEntry(
  user: AuthUser,
  id: string,
  input: {
    version: number;
    durationMinutes?: number;
    description?: string | null;
    workDate?: string;
    clientId?: string;
    activityId?: string;
  },
): Promise<TimeEntryDto> {
  const existing = await getTimeEntry(user, id);
  const ownEmployeeId = await requireOwnEmployee(user);
  if (
    existing.employeeId !== ownEmployeeId &&
    !can(user, "time_entries:read_others")
  ) {
    throw httpError(403, "Forbidden");
  }
  if (existing.employeeId !== ownEmployeeId) {
    // Managers/admins may edit others in Phase 1 matrix.
  } else {
    assertCan(user, "time_entries:create_own");
  }

  if (existing.version !== input.version) {
    throw httpError(409, "Version conflict");
  }

  const durationMinutes =
    input.durationMinutes === undefined
      ? existing.durationMinutes
      : assertDurationMinutes(input.durationMinutes);

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(timeEntries)
      .set({
        durationMinutes,
        description:
          input.description === undefined
            ? existing.description
            : input.description,
        workDate: input.workDate ?? existing.workDate,
        clientId: input.clientId ?? existing.clientId,
        activityId: input.activityId ?? existing.activityId,
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(timeEntries.id, id),
          eq(timeEntries.version, input.version),
          eq(timeEntries.isCurrent, true),
          isNull(timeEntries.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      throw httpError(409, "Version conflict");
    }

    await writeAudit(tx, {
      actorUserId: user.id,
      entityType: "time_entry",
      entityId: updated.id,
      action: "update",
      beforeState: existing,
      afterState: updated,
    });

    return toDto(updated);
  });
}

export async function deleteTimeEntry(
  user: AuthUser,
  id: string,
  version: number,
): Promise<void> {
  const existing = await getTimeEntry(user, id);
  const ownEmployeeId = await requireOwnEmployee(user);
  if (
    existing.employeeId !== ownEmployeeId &&
    !can(user, "time_entries:read_others")
  ) {
    throw httpError(403, "Forbidden");
  }
  if (existing.version !== version) {
    throw httpError(409, "Version conflict");
  }

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(timeEntries)
      .set({
        deletedAt: new Date(),
        isCurrent: false,
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(timeEntries.id, id),
          eq(timeEntries.version, version),
          eq(timeEntries.isCurrent, true),
          isNull(timeEntries.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      throw httpError(409, "Version conflict");
    }

    await writeAudit(tx, {
      actorUserId: user.id,
      entityType: "time_entry",
      entityId: id,
      action: "delete",
      beforeState: existing,
      afterState: updated,
    });
  });
}

/** Used by reports — current non-deleted rows only. */
export function currentEntryFilter() {
  return and(eq(timeEntries.isCurrent, true), isNull(timeEntries.deletedAt));
}
