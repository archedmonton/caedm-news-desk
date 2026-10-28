import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { followUps, notifications, notificationStories, stories, users } from "@/lib/db/schema";
import { upsertStory } from "@/lib/ingest/collector";
import { evaluateAlerts, processAlerts } from "@/lib/notify/alerts";
import { deliverNotification, retryDeliveries } from "@/lib/notify/deliver";
import { buildDigest, createDigestPreviewNotification, runScheduledDigest, sectionFor } from "@/lib/notify/digest";
import { setTransportOverride } from "@/lib/notify/transport";
import { DEFAULT_PRIORITY_RULES } from "@/lib/priority/rules";
import { setSettings } from "@/lib/settings";
import { overridePriority } from "@/lib/workflow";
import { sourceBySlug, testDb } from "./helpers";

const staff = (db: ReturnType<typeof testDb>) =>
  (db.select().from(users).where(eq(users.email, "staff@caedm.ca")).get() ?? db.insert(users).values({ email: "staff@caedm.ca", status: "active" }).returning().get()).id;

// 2026-10-28 is MDT (UTC-6): 07:30 Edmonton = 13:30Z. 2026-11-02 is MST (UTC-7): 07:30 = 14:30Z.
const at = (iso: string) => Date.parse(iso);

function addStory(db: ReturnType<typeof testDb>, slug: string, title: string, opts: { now: number; publishedAt?: number; baseline?: boolean; url?: string }) {
  const src = sourceBySlug(db, slug);
  return upsertStory(
    db,
    src,
    { title, url: opts.url ?? `https://example.org/${encodeURIComponent(title)}`, publishedAt: opts.publishedAt ?? opts.now - 3600_000, updatedAt: null, description: `Description for ${title}`, descriptionSource: "feed", categories: [] },
    { now: opts.now, rules: DEFAULT_PRIORITY_RULES, baseline: opts.baseline ?? false },
  )!;
}

describe("morning digest", () => {
  let db: ReturnType<typeof testDb>;
  beforeEach(() => {
    db = testDb();
  });

  it("is not due before 07:30 Edmonton and runs once after, surviving restarts", async () => {
    addStory(db, "ecsd", "School council meeting in Edmonton", { now: at("2026-10-28T05:00:00Z") });
    expect((await runScheduledDigest(db, at("2026-10-28T13:29:00Z"))).status).toBe("not_due");
    const r = await runScheduledDigest(db, at("2026-10-28T13:31:00Z"));
    expect(r).toMatchObject({ status: "created", dateKey: "2026-10-28", storyCount: 1 });
    // Simulated "restart": repeated ticks and a second worker do nothing.
    expect((await runScheduledDigest(db, at("2026-10-28T13:32:00Z"))).status).toBe("already_done");
    expect((await runScheduledDigest(db, at("2026-10-28T16:00:00Z"))).status).toBe("already_done");
    const rows = db.select().from(notifications).where(eq(notifications.kind, "digest")).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("simulated");
    expect(rows[0].subject).toBe("CAEDM Morning News Brief | October 28, 2026");
    expect(rows[0].recipient).toBe("communications@caedm.ca");
  });

  it("uses Edmonton wall-clock time across the DST change", async () => {
    // Monday after fall-back: 07:30 MST = 14:30Z; 13:45Z is only 06:45 local.
    expect((await runScheduledDigest(db, at("2026-11-02T13:45:00Z"))).status).toBe("not_due");
    expect((await runScheduledDigest(db, at("2026-11-02T14:31:00Z"))).status).toBe("created");
    // Late-evening UTC still belongs to the Edmonton calendar day already sent.
    expect((await runScheduledDigest(db, at("2026-11-03T05:00:00Z"))).status).toBe("already_done");
  });

  it("never repeats a story in a later digest", async () => {
    addStory(db, "covenant-health", "Hospital update one", { now: at("2026-10-28T06:00:00Z") });
    await runScheduledDigest(db, at("2026-10-28T13:31:00Z"));
    addStory(db, "covenant-health", "Hospital update two", { now: at("2026-10-28T20:00:00Z") });
    const next = await runScheduledDigest(db, at("2026-10-29T13:31:00Z"));
    expect(next).toMatchObject({ status: "created", storyCount: 1 });
    const linked = db.select().from(notificationStories).where(eq(notificationStories.kind, "digest")).all();
    expect(new Set(linked.map((l) => l.storyId)).size).toBe(linked.length);
  });

  it("produces a clear no-new-stories digest", async () => {
    const d = buildDigest(db, at("2026-10-28T13:31:00Z"));
    expect(d.storyIds).toHaveLength(0);
    expect(d.html).toContain("No new stories from monitored sources since the last briefing.");
    expect(d.text).toContain("No outstanding follow-ups.");
  });

  it("excludes old baseline backlog and archived stories; lists follow-ups", async () => {
    const now = at("2026-10-28T13:31:00Z");
    addStory(db, "vatican-news", "Old backlog item", { now, publishedAt: now - 10 * 86400_000, baseline: true });
    const archived = addStory(db, "ecsd", "Archived item", { now: now - 3600_000 });
    db.update(stories).set({ reviewStatus: "archived" }).where(eq(stories.id, archived)).run();
    const fuStory = addStory(db, "ecsd", "Needs follow up", { now: now - 7200_000 });
    const u = db.insert(users).values({ email: "a@caedm.ca", name: "Alex", status: "active" }).returning().get();
    db.insert(followUps).values({ storyId: fuStory, assigneeId: u.id, dueAt: now - 1000 }).run();
    db.update(stories).set({ reviewStatus: "assigned" }).where(eq(stories.id, fuStory)).run();
    const d = buildDigest(db, now);
    expect(d.storyIds).toEqual([fuStory]);
    expect(d.followUps).toEqual([expect.objectContaining({ title: "Needs follow up", assignee: "Alex", overdue: true })]);
  });

  it("assigns each story to one section", () => {
    expect(sectionFor({ priority: "P1", category: "vatican", geoRelevance: "international", orgType: "vatican" })).toBe("top");
    expect(sectionFor({ priority: "P2", category: "archdiocese", geoRelevance: "edmonton", orgType: "archdiocese" })).toBe("edmonton_catholic");
    expect(sectionFor({ priority: "P2", category: "healthcare", geoRelevance: "alberta", orgType: "catholic_partner" })).toBe("partners");
    expect(sectionFor({ priority: "P3", category: "vatican", geoRelevance: "international", orgType: "vatican" })).toBe("canadian_vatican");
    expect(sectionFor({ priority: "P2", category: "government_policy", geoRelevance: "alberta", orgType: "government" })).toBe("alberta");
    expect(sectionFor({ priority: "P2", category: "event", geoRelevance: "edmonton", orgType: "catholic_partner" })).toBe("events");
  });

  it("records a missed digest instead of sending a stale one", async () => {
    // Fresh install after the window: nothing to report yet.
    expect((await runScheduledDigest(db, at("2026-10-28T19:00:00Z"))).status).toBe("not_due");
    expect((await runScheduledDigest(db, at("2026-10-29T13:31:00Z"))).status).toBe("created");
    // Worker down for the whole window on the following day.
    expect((await runScheduledDigest(db, at("2026-10-30T19:00:00Z"))).status).toBe("missed");
    const last = db.select().from(notifications).all().at(-1)!;
    expect(last).toMatchObject({ status: "skipped", dedupeKey: "digest:2026-10-30" });
  });

  it("preview does not consume stories from the scheduled digest", async () => {
    addStory(db, "ecsd", "Preview candidate", { now: at("2026-10-28T08:00:00Z") });
    await createDigestPreviewNotification(db, at("2026-10-28T09:00:00Z"));
    expect((await runScheduledDigest(db, at("2026-10-28T13:31:00Z")))).toMatchObject({ status: "created", storyCount: 1 });
  });

  it("escapes publisher text in the HTML", () => {
    const now = at("2026-10-28T13:31:00Z");
    addStory(db, "ecsd", `<script>alert(1)</script> Edmonton school`, { now: now - 1000 });
    const d = buildDigest(db, now);
    expect(d.html).not.toContain("<script>alert(1)</script>");
    expect(d.html).toContain("&lt;script&gt;");
  });
});

describe("high-priority alerts", () => {
  let db: ReturnType<typeof testDb>;
  const noon = at("2026-10-28T18:00:00Z"); // 12:00 MDT, inside 07:00–21:00
  const night = at("2026-10-29T05:00:00Z"); // 23:00 MDT
  beforeEach(() => {
    db = testDb();
  });
  afterEach(() => setTransportOverride(null));

  it("alerts only qualifying P0/P1 stories, once, batched", async () => {
    const p1 = addStory(db, "covenant-health", "Misericordia hospital announces new safety model", { now: noon - 60_000 });
    const p2 = addStory(db, "ecsd", "Bus driver appreciation day", { now: noon - 60_000 });
    const p0 = addStory(db, "caedm", "Archbishop of Edmonton hospitalized in emergency", { now: noon - 60_000 });
    const priorities = Object.fromEntries(db.select().from(stories).all().map((s) => [s.id, s.priority]));
    expect([priorities[p0], priorities[p1], priorities[p2]]).toEqual(["P0", "P1", "P2"]);

    const r = await processAlerts(db, noon);
    expect(r.status).toBe("created");
    if (r.status === "created") expect(r.storyIds.sort()).toEqual([p0, p1].sort());
    const alert = db.select().from(notifications).where(eq(notifications.kind, "alert")).get()!;
    expect(alert.status).toBe("simulated");
    expect(alert.subject).toMatch(/P0 News Alert: 2 high-priority stories/);
    expect((await processAlerts(db, noon + 60_000)).status).toBe("none");
  });

  it("never alerts on baseline backlog or old detections", async () => {
    addStory(db, "caedm", "Archbishop of Edmonton hospitalized in emergency", { now: noon, baseline: true });
    addStory(db, "caedm", "Archdiocese of Edmonton emergency closure", { now: noon - 7 * 3600_000 });
    expect(evaluateAlerts(db, noon).eligible).toHaveLength(0);
  });

  it("holds P1 outside alert hours but lets P0 through when configured", async () => {
    addStory(db, "covenant-health", "Misericordia hospital announces new safety model", { now: night - 60_000 });
    let ev = evaluateAlerts(db, night);
    expect(ev.eligible).toHaveLength(0);
    expect(ev.held[0].held).toMatch(/Outside alert hours/);
    addStory(db, "caedm", "Archbishop of Edmonton hospitalized in emergency", { now: night - 60_000 });
    ev = evaluateAlerts(db, night);
    expect(ev.eligible.map((e) => e.priority)).toEqual(["P0"]);
    setSettings({ alertP0BypassWindow: false }, null, db);
    expect(evaluateAlerts(db, night).eligible).toHaveLength(0);
  });

  it("enforces flood limits and records the suppression", async () => {
    setSettings({ alertMaxPerHour: 1 }, null, db);
    addStory(db, "caedm", "Archdiocese of Edmonton emergency statement one", { now: noon - 60_000 });
    expect((await processAlerts(db, noon)).status).toBe("created");
    addStory(db, "caedm", "Archdiocese of Edmonton urgent closure two", { now: noon + 60_000 });
    const r = await processAlerts(db, noon + 120_000);
    expect(r.status).toBe("rate_limited");
    const skipped = db.select().from(notifications).where(eq(notifications.status, "skipped")).get()!;
    expect(skipped.lastError).toMatch(/Hourly alert limit/);
    expect((await processAlerts(db, noon + 180_000)).status).toBe("none");
  });

  it("labels sensitive claims as internal review, not established fact", async () => {
    addStory(db, "manual", "Allegations reported involving Edmonton Catholic parish investigation", { now: noon - 60_000 });
    const s = db.select().from(stories).get()!;
    overridePriority(s.id, "P1", "Needs Communications awareness", staff(db), db);
    const r = await processAlerts(db, noon);
    expect(r.status).toBe("created");
    const n = db.select().from(notifications).where(eq(notifications.kind, "alert")).get()!;
    expect(n.subject.startsWith("[INTERNAL REVIEW – UNVERIFIED]")).toBe(true);
    expect(n.html).toContain("not as established facts");
  });

  it("manual override to P1 makes an older story eligible", async () => {
    const id = addStory(db, "ecsd", "Bus driver appreciation day", { now: noon - 2 * 86400_000 });
    expect(evaluateAlerts(db, noon).eligible).toHaveLength(0);
    overridePriority(id, "P1", "Media interest", staff(db), db);
    expect(evaluateAlerts(db, noon).eligible.map((e) => e.id)).toEqual([id]);
  });

  it("retries failed deliveries with backoff and reports failure", async () => {
    let attempts = 0;
    setTransportOverride({
      name: "test",
      async send() {
        attempts++;
        if (attempts < 3) throw new Error("SMTP 451 temporary failure");
        return {};
      },
    });
    addStory(db, "caedm", "Archdiocese of Edmonton emergency statement", { now: noon - 60_000 });
    await processAlerts(db, noon);
    let n = db.select().from(notifications).where(eq(notifications.kind, "alert")).get()!;
    expect(n).toMatchObject({ status: "failed", attempts: 1, lastError: "SMTP 451 temporary failure" });
    expect(n.nextAttemptAt).toBe(noon + 60_000);
    expect(await retryDeliveries(db, noon + 30_000)).toBe(0); // backoff not elapsed
    await retryDeliveries(db, noon + 61_000);
    n = db.select().from(notifications).where(eq(notifications.id, n.id)).get()!;
    expect(n).toMatchObject({ status: "failed", attempts: 2 });
    await retryDeliveries(db, noon + 61_000 + 5 * 60_000);
    n = db.select().from(notifications).where(eq(notifications.id, n.id)).get()!;
    expect(n).toMatchObject({ status: "sent", attempts: 3, transport: "test" });
    // A sent message is never re-sent.
    await deliverNotification(n.id, db);
    expect(attempts).toBe(3);
  });
});
