import "../scripts/_bootstrap";
import { getDb } from "../src/lib/db/client";
import { runMigrations } from "../src/lib/db/migrate";
import { seedSources } from "../src/lib/db/seed";
import { runDueChecks } from "../src/lib/ingest/collector";
import { processAlerts } from "../src/lib/notify/alerts";
import { retryDeliveries } from "../src/lib/notify/deliver";
import { runScheduledDigest } from "../src/lib/notify/digest";
import { setState } from "../src/lib/settings";
import { formatDateTime } from "../src/lib/time";

const TICK_MS = 60_000;
const db = getDb();
runMigrations(db);
seedSources(db);

const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);
let running = false;
let stopping = false;

async function tick() {
  if (running || stopping) return;
  running = true;
  const started = Date.now();
  try {
    const results = await runDueChecks({ db, log });
    const alert = await processAlerts(db);
    if (alert.status === "created") log(`[alerts] alert #${alert.notificationId} for ${alert.storyIds.length} stories`);
    if (alert.status === "rate_limited") log(`[alerts] suppressed: ${alert.reason}`);
    const digest = await runScheduledDigest(db);
    if (digest.status === "created") log(`[digest] ${digest.dateKey} created (#${digest.notificationId}, ${digest.storyCount} stories)`);
    if (digest.status === "missed") log(`[digest] ${digest.dateKey} missed: worker was down for the whole window`);
    const retried = await retryDeliveries(db);
    if (retried) log(`[deliver] retried ${retried} notifications`);
    setState("worker", { lastTickAt: Date.now(), durationMs: Date.now() - started, checked: results.length, pid: process.pid }, db);
  } catch (e) {
    log(`[worker] tick failed: ${(e as Error).stack ?? e}`);
    setState("worker", { lastTickAt: Date.now(), error: (e as Error).message, pid: process.pid }, db);
  } finally {
    running = false;
  }
}

log(`CAEDM News Desk worker started (pid ${process.pid}); Edmonton time ${formatDateTime(Date.now())}`);
void tick();
const timer = setInterval(tick, TICK_MS);
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopping = true;
    clearInterval(timer);
    log("worker stopping");
    setTimeout(() => process.exit(0), running ? 5000 : 0);
  });
}
