import crypto from "node:crypto";
import { env, isProduction } from "@/lib/env";
import { runTick } from "@/lib/tick";

export const dynamic = "force-dynamic";
// First-time source syncs can take ~30 s; leave headroom (Vercel caps this per plan).
export const maxDuration = 300;

function authorized(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret) return !isProduction(); // never open in production
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Scheduler entry point. Vercel Cron calls it daily around 8 AM Edmonton (see vercel.json) with
 * "Authorization: Bearer $CRON_SECRET". Any other scheduler may call it with the same header.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const r = await runTick({ trigger: "cron", log: (m) => console.log(m) });
    if (r.status === "busy") return Response.json({ ok: true, status: "busy" });
    return Response.json({
      ok: true,
      status: r.status,
      checked: r.checked,
      newStories: r.newStories,
      briefs: r.briefs,
      alert: r.alert,
      durationMs: r.durationMs,
      failedSources: r.checks.filter((c) => c.status === "error").map((c) => c.slug),
    });
  } catch (e) {
    console.error("[cron] tick failed", e);
    return Response.json({ ok: false, error: "tick failed" }, { status: 500 });
  }
}
