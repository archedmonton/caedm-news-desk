import { and, eq, inArray, lt, lte } from "drizzle-orm";
import { first, getDb, type DB } from "../db/client";
import { notifications } from "../db/schema";
import { getLiveTransport } from "./transport";

export const RETRY_DELAYS_MIN = [1, 5, 15, 60];
export const MAX_ATTEMPTS = RETRY_DELAYS_MIN.length + 1;

/**
 * Deliver one notification. With no live transport the message is marked "simulated" (local outbox).
 * Failures are recorded and rescheduled with backoff.
 */
export async function deliverNotification(id: number, db: DB = getDb(), now = Date.now()) {
  const n = await first(db.select().from(notifications).where(eq(notifications.id, id)));
  if (!n || n.status === "sent" || n.status === "simulated" || n.status === "skipped") return n;
  const transport = getLiveTransport();
  const attempts = n.attempts + 1;
  if (!transport) {
    await db
      .update(notifications)
      .set({ status: "simulated", transport: "outbox", attempts, sentAt: now, lastError: null, nextAttemptAt: null })
      .where(eq(notifications.id, id));
  } else {
    try {
      const replyTo = typeof n.meta?.replyTo === "string" ? n.meta.replyTo : undefined;
      await transport.send({ to: n.recipient, subject: n.subject, html: n.html, text: n.text, replyTo });
      await db
        .update(notifications)
        .set({ status: "sent", transport: transport.name, attempts, sentAt: Date.now(), lastError: null, nextAttemptAt: null })
        .where(eq(notifications.id, id));
    } catch (e) {
      const delay = RETRY_DELAYS_MIN[attempts - 1];
      await db
        .update(notifications)
        .set({
          status: "failed",
          transport: transport.name,
          attempts,
          lastError: (e as Error).message.slice(0, 500),
          nextAttemptAt: attempts < MAX_ATTEMPTS && delay ? now + delay * 60_000 : null,
        })
        .where(eq(notifications.id, id));
    }
  }
  return await first(db.select().from(notifications).where(eq(notifications.id, id)));
}

/** Retry failed deliveries whose backoff has elapsed, plus any stranded "pending" rows. */
export async function retryDeliveries(db: DB = getDb(), now = Date.now()) {
  const due = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(inArray(notifications.status, ["failed", "pending"]), lt(notifications.attempts, MAX_ATTEMPTS), lte(notifications.nextAttemptAt, now)),
    );
  const stranded = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.status, "pending"), eq(notifications.attempts, 0), lt(notifications.createdAt, now - 60_000)));
  const ids = [...new Set([...due, ...stranded].map((r) => r.id))];
  for (const id of ids) await deliverNotification(id, db, now);
  return ids.length;
}
