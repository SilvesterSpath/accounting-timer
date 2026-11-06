import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { clients } from "../db/schema.js";
import { writeAudit } from "./audit.js";

/** Gate A fictional CRM catalog — Admin sync upserts into clients. */
export const MOCK_CRM_CLIENTS = [
  { externalId: "CRM-100", name: "Pannon Könyvelő Kft." },
  { externalId: "CRM-200", name: "Szabó Gábor e.v." },
  { externalId: "CRM-300", name: "Kiss Mária e.v." },
] as const;

export async function syncMockCrm(actorUserId: string): Promise<{
  upserted: number;
  clients: Array<{
    id: string;
    name: string;
    externalId: string;
    sourceSystem: string;
    active: boolean;
    isSystemInternal: boolean;
  }>;
}> {
  let upserted = 0;
  const now = new Date();

  await db.transaction(async (tx) => {
    for (const row of MOCK_CRM_CLIENTS) {
      const existing = await tx
        .select()
        .from(clients)
        .where(eq(clients.externalId, row.externalId))
        .limit(1);

      if (existing[0]) {
        const updatedRows = await tx
          .update(clients)
          .set({
            name: row.name,
            active: true,
            syncedAt: now,
            updatedAt: now,
          })
          .where(eq(clients.id, existing[0].id))
          .returning();
        const updated = updatedRows[0];
        if (!updated) {
          throw new Error(`Failed to update client ${row.externalId}`);
        }
        await writeAudit(tx, {
          actorUserId,
          entityType: "client",
          entityId: updated.id,
          action: "crm_sync_update",
          beforeState: existing[0],
          afterState: updated,
        });
      } else {
        const createdRows = await tx
          .insert(clients)
          .values({
            sourceSystem: "mock_crm",
            externalId: row.externalId,
            name: row.name,
            active: true,
            isSystemInternal: false,
            syncedAt: now,
          })
          .returning();
        const created = createdRows[0];
        if (!created) {
          throw new Error(`Failed to create client ${row.externalId}`);
        }
        await writeAudit(tx, {
          actorUserId,
          entityType: "client",
          entityId: created.id,
          action: "crm_sync_create",
          afterState: created,
        });
      }
      upserted += 1;
    }
  });

  const all = await db.select().from(clients);
  return {
    upserted,
    clients: all.map((c) => ({
      id: c.id,
      name: c.name,
      externalId: c.externalId,
      sourceSystem: c.sourceSystem,
      active: c.active,
      isSystemInternal: c.isSystemInternal,
    })),
  };
}
