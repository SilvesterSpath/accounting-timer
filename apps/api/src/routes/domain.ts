import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { assertCan } from "../auth/rbac.js";
import { db } from "../db/client.js";
import { activities, clients } from "../db/schema.js";
import { syncMockCrm } from "../services/crm.js";
import { listEmployeesForOperator } from "../services/employees.js";
import {
  getDailySummary,
  getManagementClientWorkload,
  getMonthlySummary,
  requireReportingMonth,
} from "../services/reports.js";
import {
  createTimeEntry,
  deleteTimeEntry,
  getTimeEntry,
  listTimeEntries,
  patchTimeEntry,
} from "../services/timeEntries.js";

const createEntryBody = z.object({
  clientId: z.string().uuid(),
  activityId: z.string().uuid(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutes: z.number().int(),
  description: z.string().max(2000).optional(),
});

const patchEntryBody = z.object({
  version: z.number().int().positive(),
  durationMinutes: z.number().int().optional(),
  description: z.string().max(2000).nullable().optional(),
  workDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  clientId: z.string().uuid().optional(),
  activityId: z.string().uuid().optional(),
});

export async function domainRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/clients", async (request) => {
    requireAuth(request);
    const rows = await db
      .select()
      .from(clients)
      .where(eq(clients.active, true));
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      externalId: c.externalId,
      sourceSystem: c.sourceSystem,
      isSystemInternal: c.isSystemInternal,
    }));
  });

  app.get("/api/v1/activities", async (request) => {
    requireAuth(request);
    const rows = await db
      .select()
      .from(activities)
      .where(eq(activities.active, true));
    return rows.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      isInternal: a.isInternal,
    }));
  });

  app.post("/api/v1/crm/sync/clients", async (request) => {
    const user = requireAuth(request);
    assertCan(user, "crm:sync");
    return syncMockCrm(user.id);
  });

  app.get("/api/v1/employees", async (request) => {
    const user = requireAuth(request);
    return listEmployeesForOperator(user);
  });

  app.get("/api/v1/time-entries", async (request) => {
    const user = requireAuth(request);
    const query = request.query as {
      employeeId?: string;
      workDate?: string;
    };
    return listTimeEntries(user, query);
  });

  app.post("/api/v1/time-entries", async (request, reply) => {
    const user = requireAuth(request);
    const body = createEntryBody.parse(request.body);
    const created = await createTimeEntry(user, body);
    return reply.code(201).send(created);
  });

  app.get("/api/v1/time-entries/:id", async (request) => {
    const user = requireAuth(request);
    const { id } = request.params as { id: string };
    return getTimeEntry(user, id);
  });

  app.patch("/api/v1/time-entries/:id", async (request) => {
    const user = requireAuth(request);
    const { id } = request.params as { id: string };
    const body = patchEntryBody.parse(request.body);
    return patchTimeEntry(user, id, body);
  });

  app.delete("/api/v1/time-entries/:id", async (request, reply) => {
    const user = requireAuth(request);
    const { id } = request.params as { id: string };
    const body = z
      .object({ version: z.number().int().positive() })
      .parse(request.body ?? {});
    await deleteTimeEntry(user, id, body.version);
    return reply.code(204).send();
  });

  app.get("/api/v1/reports/summary", async (request) => {
    const user = requireAuth(request);
    const query = request.query as {
      workDate?: string;
      month?: string;
      scope?: string;
      employeeId?: string;
    };
    if (query.workDate) {
      return getDailySummary(user, query.workDate, {
        employeeId: query.employeeId,
      });
    }
    if (query.month) {
      return getMonthlySummary(user, query.month, {
        management: query.scope === "management",
        employeeId: query.employeeId,
      });
    }
    return { error: "Provide workDate or month" };
  });

  app.get("/api/v1/reports/management/client-workload", async (request) => {
    const user = requireAuth(request);
    const query = request.query as { month?: string };
    const month = requireReportingMonth(query.month);
    return getManagementClientWorkload(user, month);
  });
}
