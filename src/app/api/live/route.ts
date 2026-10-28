import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { first, getDb } from "@/lib/db/client";
import { stories } from "@/lib/db/schema";
import { getTickState, hasDueSources, runTick } from "@/lib/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Don't start a background refresh more often than this, however many people are signed in. */
const MIN_REFRESH_GAP_MS = 2 * 60_000;

/**
 * Polled by signed-in browsers (about once a minute while the tab is visible). Reports stories added since
 * the id the browser last saw, and, when sources are due, starts a background refresh after responding.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const since = Number(new URL(req.url).searchParams.get("since")) || 0;
  const db = getDb();
  const now = Date.now();

  const latest = await first(db.select({ id: stories.id }).from(stories).orderBy(desc(stories.id)).limit(1));
  const fresh = since
    ? await first(
        db
          .select({
            n: sql<number>`count(*)`.mapWith(Number),
            high: sql<number>`count(*) filter (where ${inArray(stories.priority, ["P0", "P1"])})`.mapWith(Number),
          })
          .from(stories)
          .where(and(gt(stories.id, since), eq(stories.isSample, false))),
      )
    : undefined;
  const tick = await getTickState(db);
  const due = await hasDueSources(db, now);
  const refreshing = due && (!tick || now - tick.lastTickAt > MIN_REFRESH_GAP_MS);
  if (refreshing) {
    after(async () => {
      try {
        await runTick({ trigger: "live", db });
      } catch (e) {
        console.error("[live] background refresh failed", e);
      }
    });
  }

  return Response.json(
    {
      latestId: latest?.id ?? 0,
      newStories: fresh?.n ?? 0,
      newHighPriority: fresh?.high ?? 0,
      lastRefreshAt: tick?.lastTickAt ?? null,
      refreshing,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
