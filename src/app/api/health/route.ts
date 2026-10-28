import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getTickState } from "@/lib/tick";

export const dynamic = "force-dynamic";

/** Unauthenticated liveness probe. Exposes no story or user data. */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    const tick = await getTickState();
    return Response.json({
      ok: true,
      db: "ok",
      lastRefreshSecondsAgo: tick ? Math.round((Date.now() - tick.lastTickAt) / 1000) : null,
      lastRefreshTrigger: tick?.trigger ?? null,
    });
  } catch (e) {
    console.error("[health]", (e as Error).message);
    return Response.json({ ok: false }, { status: 503 });
  }
}
