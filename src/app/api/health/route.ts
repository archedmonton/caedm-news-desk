import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getState } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Unauthenticated liveness probe. Exposes no story or user data. */
export function GET() {
  try {
    getDb().run(sql`select 1`);
    const worker = getState<{ lastTickAt: number }>("worker");
    const workerAgeSec = worker ? Math.round((Date.now() - worker.lastTickAt) / 1000) : null;
    return Response.json({ ok: true, db: "ok", workerLastTickSecondsAgo: workerAgeSec });
  } catch (e) {
    console.error("[health]", (e as Error).message);
    return Response.json({ ok: false }, { status: 503 });
  }
}
