import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { first, getDb, type DB } from "./db/client";
import { sources } from "./db/schema";
import { runDueChecks } from "./ingest/collector";
import { processAlerts } from "./notify/alerts";
import { retryDeliveries } from "./notify/deliver";
import { runPersonalBriefs, runScheduledDigest } from "./notify/digest";
import { acquireLease, getState, releaseLease, setState } from "./settings";

export type TickTrigger = "cron" | "live" | "worker" | "manual";
export type TickState = {
  lastTickAt: number;
  trigger: TickTrigger;
  durationMs: number;
  checked: number;
  newStories: number;
  digest: string;
  error?: string;
};

/** Longest a refresh may hold the lease (matches the serverless function limit). */
const LEASE_MS = 5 * 60_000;

/**
 * One refresh: check due sources → send qualifying alerts → send the morning brief and any personal briefs that
 * are due → retry failed emails. Safe to call from anywhere at any frequency: the lease allows one run at a time across all server
 * instances, and every step is idempotent.
 */
export async function runTick(opts: { trigger: TickTrigger; db?: DB; log?: (m: string) => void; force?: boolean } = { trigger: "manual" }) {
  const db = opts.db ?? getDb();
  const log = opts.log ?? (() => {});
  if (!(await acquireLease("tick", LEASE_MS, db))) return { status: "busy" as const };
  const started = Date.now();
  try {
    const checks = await runDueChecks({ db, log, force: opts.force });
    const alert = await processAlerts(db);
    if (alert.status === "created") log(`[alerts] alert #${alert.notificationId} for ${alert.storyIds.length} stories`);
    if (alert.status === "rate_limited") log(`[alerts] suppressed: ${alert.reason}`);
    const digest = await runScheduledDigest(db);
    if (digest.status === "created") log(`[digest] ${digest.dateKey} created (#${digest.notificationId}, ${digest.storyCount} stories)`);
    const briefs = await runPersonalBriefs(db);
    if (briefs.sent || briefs.empty) log(`[briefs] ${briefs.sent} personal briefs sent, ${briefs.empty} with nothing new`);
    const retried = await retryDeliveries(db);
    if (retried) log(`[deliver] retried ${retried} notifications`);
    const state: TickState = {
      lastTickAt: Date.now(),
      trigger: opts.trigger,
      durationMs: Date.now() - started,
      checked: checks.length,
      newStories: checks.reduce((n, c) => n + c.itemsNew, 0),
      digest: digest.status,
    };
    await setState("tick", state, db);
    return { status: "ok" as const, ...state, checks, alert: alert.status };
  } catch (e) {
    await setState(
      "tick",
      {
        lastTickAt: Date.now(),
        trigger: opts.trigger,
        durationMs: Date.now() - started,
        checked: 0,
        newStories: 0,
        digest: "error",
        error: (e as Error).message,
      },
      db,
    );
    throw e;
  } finally {
    await releaseLease("tick", db);
  }
}

/** True when at least one monitored source is due for a check. */
export async function hasDueSources(db: DB = getDb(), now = Date.now()) {
  const row = await first(
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(sources)
      .where(
        and(
          eq(sources.enabled, true),
          eq(sources.verified, true),
          inArray(sources.method, ["rss", "html"]),
          or(isNull(sources.nextCheckAt), lte(sources.nextCheckAt, now)),
        ),
      ),
  );
  return (row?.n ?? 0) > 0;
}

export const getTickState = (db: DB = getDb()) => getState<TickState>("tick", db);
