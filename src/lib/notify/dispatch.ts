import { after } from "next/server";
import { getDb, type DB } from "../db/client";
import { deliverNotification } from "./deliver";

/**
 * - `now`: send before returning (scheduled refresh, CLI scripts, tests).
 * - `after-response`: reply to the browser first, then send. Used by every button that sends email, so a slow
 *   mail server can't hold the page open until the platform's 504.
 */
export type DeliveryMode = "now" | "after-response";

/**
 * `after()` keeps the serverless function alive until the send finishes (Vercel `waitUntil`), so this is not a
 * fire-and-forget promise. The outbox row is the durable record: if this never runs, the next refresh sends the
 * still-"pending" row, and the atomic claim in deliverNotification stops two senders racing.
 */
export async function dispatchNotification(id: number, mode: DeliveryMode, db: DB = getDb(), now = Date.now()) {
  if (mode === "now") return deliverNotification(id, db, now);
  after(async () => {
    try {
      await deliverNotification(id);
    } catch (e) {
      console.error(JSON.stringify({ evt: "email.delivery", id, status: "error", error: (e as Error).message.slice(0, 300) }));
    }
  });
  return null;
}
