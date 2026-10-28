import { getDb, type DB } from "./db/client";
import { auditLogs } from "./db/schema";

export async function audit(
  action: string,
  entityType: string,
  entityId: string | number | null,
  userId: number | null,
  details?: Record<string, unknown>,
  db: DB = getDb(),
) {
  await db
    .insert(auditLogs)
    .values({ action, entityType, entityId: entityId == null ? null : String(entityId), userId, details, createdAt: Date.now() });
}
