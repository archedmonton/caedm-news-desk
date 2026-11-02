import { and, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { first, getDb, type DB } from "../db/client";
import { notifications } from "../db/schema";
import { getLiveTransport, isUncertainDelivery } from "./transport";

export const RETRY_DELAYS_MIN = [1, 5, 15, 60];
export const MAX_ATTEMPTS = RETRY_DELAYS_MIN.length + 1;
/** A claim older than this means the sender was stopped mid-send (e.g. the function hit its time limit). */
export const STALE_CLAIM_MS = 5 * 60_000;

/** One JSON line per delivery attempt: status, timing and correlation id. Never recipients' tokens or credentials. */
function logDelivery(fields: Record<string, unknown>) {
  console.info(JSON.stringify({ evt: "email.delivery", ...fields }));
}

/**
 * Deliver one notification. The row is claimed atomically (pending/failed → sending) first, so two workers (the
 * request that created it and a scheduled refresh) can never send the same message. With no live transport the
 * message is marked "simulated" (local outbox). Definite failures are retried with backoff; a send the server may
 * have accepted without confirming is marked "unknown" and never resent automatically.
 */
export async function deliverNotification(id: number, db: DB = getDb(), now = Date.now()) {
  const transport = getLiveTransport();
  const [n] = await db
    .update(notifications)
    .set({ status: "sending", claimedAt: now, attempts: sql`${notifications.attempts} + 1`, transport: transport?.name ?? "outbox" })
    .where(and(eq(notifications.id, id), inArray(notifications.status, ["pending", "failed"])))
    .returning();
  if (!n) return await first(db.select().from(notifications).where(eq(notifications.id, id)));
  const op = typeof n.meta?.op === "string" ? n.meta.op : undefined;

  if (!transport) {
    await db
      .update(notifications)
      .set({ status: "simulated", sentAt: now, lastError: null, nextAttemptAt: null })
      .where(eq(notifications.id, id));
  } else {
    const started = Date.now();
    try {
      const replyTo = typeof n.meta?.replyTo === "string" ? n.meta.replyTo : undefined;
      await transport.send({ to: n.recipient, subject: n.subject, html: n.html, text: n.text, replyTo });
      await db
        .update(notifications)
        .set({ status: "sent", sentAt: Date.now(), lastError: null, nextAttemptAt: null })
        .where(eq(notifications.id, id));
      logDelivery({ id, kind: n.kind, op, status: "sent", attempt: n.attempts, ms: Date.now() - started, transport: transport.name });
    } catch (e) {
      const message = (e as Error).message.slice(0, 500);
      if (isUncertainDelivery(e)) {
        await db.update(notifications).set({ status: "unknown", lastError: message, nextAttemptAt: null }).where(eq(notifications.id, id));
        logDelivery({ id, kind: n.kind, op, status: "unknown", attempt: n.attempts, ms: Date.now() - started, error: message });
      } else {
        const delay = RETRY_DELAYS_MIN[n.attempts - 1];
        const nextAttemptAt = n.attempts < MAX_ATTEMPTS && delay ? now + delay * 60_000 : null;
        await db.update(notifications).set({ status: "failed", lastError: message, nextAttemptAt }).where(eq(notifications.id, id));
        logDelivery({ id, kind: n.kind, op, status: "failed", attempt: n.attempts, ms: Date.now() - started, retryAt: nextAttemptAt, error: message });
      }
    }
  }
  return await first(db.select().from(notifications).where(eq(notifications.id, id)));
}

/**
 * Retry failed deliveries whose backoff has elapsed, plus "pending" rows nobody claimed (the request that created
 * them ended before sending). Rows stuck in "sending" are marked "unknown", not resent: the sender may have
 * reached the mail server before it stopped.
 */
export async function retryDeliveries(db: DB = getDb(), now = Date.now()) {
  const abandoned = await db
    .update(notifications)
    .set({ status: "unknown", lastError: "Delivery unconfirmed: sending was interrupted before the mail server confirmed it.", nextAttemptAt: null })
    .where(and(eq(notifications.status, "sending"), lt(notifications.claimedAt, now - STALE_CLAIM_MS)))
    .returning({ id: notifications.id, kind: notifications.kind });
  for (const a of abandoned) logDelivery({ id: a.id, kind: a.kind, status: "unknown", reason: "stale_claim" });

  const due = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.status, "failed"), lt(notifications.attempts, MAX_ATTEMPTS), lte(notifications.nextAttemptAt, now)));
  const stranded = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.status, "pending"), lt(notifications.createdAt, now - 60_000)));
  const ids = [...new Set([...due, ...stranded].map((r) => r.id))];
  for (const id of ids) await deliverNotification(id, db, now);
  return ids.length;
}

/**
 * A person checked with the recipient and chose to resend a message whose delivery was never confirmed. Puts it
 * back in the queue; the caller then dispatches it.
 */
export async function requeueUnconfirmed(id: number, db: DB = getDb()) {
  const reset = await db
    .update(notifications)
    .set({ status: "pending", lastError: null, nextAttemptAt: null, claimedAt: null })
    .where(and(eq(notifications.id, id), eq(notifications.status, "unknown")))
    .returning({ id: notifications.id });
  if (!reset.length) throw new Error("Only messages with an unconfirmed delivery can be resent this way.");
}
