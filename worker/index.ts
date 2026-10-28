import "../scripts/_bootstrap";
import { closeDb, dbKind, getDb } from "../src/lib/db/client";
import { runMigrations } from "../src/lib/db/migrate";
import { seedSources } from "../src/lib/db/seed";
import { runTick } from "../src/lib/tick";
import { formatDateTime } from "../src/lib/time";

// Optional for self-hosting. On Vercel, Vercel Cron and live refresh replace this process.
const TICK_MS = 60_000;
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);

async function main() {
  const db = getDb();
  await runMigrations(db, dbKind());
  await seedSources(db);
  let running = false;
  let stopping = false;
  const tick = async () => {
    if (running || stopping) return;
    running = true;
    try {
      const r = await runTick({ trigger: "worker", db, log });
      if (r.status === "busy") log("[worker] another refresh is running; skipped");
    } catch (e) {
      log(`[worker] tick failed: ${(e as Error).stack ?? e}`);
    } finally {
      running = false;
    }
  };
  log(`CAEDM News Desk worker started (pid ${process.pid}); Edmonton time ${formatDateTime(Date.now())}`);
  void tick();
  const timer = setInterval(tick, TICK_MS);
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      stopping = true;
      clearInterval(timer);
      log("worker stopping");
      const wait = setInterval(async () => {
        if (running) return;
        clearInterval(wait);
        await closeDb();
        process.exit(0);
      }, 200);
    });
  }
}

void main();
