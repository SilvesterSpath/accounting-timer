import { auditLogs } from "../db/schema.js";

type AuditWriter = {
  insert: typeof import("../db/client.js").db.insert;
};

export async function writeAudit(
  tx: AuditWriter,
  input: {
    actorUserId: string;
    entityType: string;
    entityId: string;
    action: string;
    beforeState?: unknown;
    afterState?: unknown;
  },
): Promise<void> {
  await tx.insert(auditLogs).values({
    actorUserId: input.actorUserId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    beforeState: input.beforeState ?? null,
    afterState: input.afterState ?? null,
  });
}
