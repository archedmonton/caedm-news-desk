import { first } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { followUps, notifications, notificationStories, stories, users } from "@/lib/db/schema";
import { upsertStory } from "@/lib/ingest/collector";
import { evaluateAlerts, processAlerts } from "@/lib/notify/alerts";
import { deliverNotification, retryDeliveries } from "@/lib/notify/deliver";
import { buildDigest, createDigestPreviewNotification, runPersonalBriefs, runScheduledDigest, sectionFor, sendBriefNow } from "@/lib/notify/digest";
import { setTransportOverride } from "@/lib/notify/transport";
import { DEFAULT_PRIORITY_RULES } from "@/lib/priority/rules";
import { setSettings } from "@/lib/settings";
import { overridePriority } from "@/lib/workflow";
import { sourceBySlug, testDb } from "./helpers";

const staff = async (db: Awaited<ReturnType<typeof testDb>>) =>
  (
    (await first(db.select().from(users).where(eq(users.email, "staff@caedm.ca")))) ??
    (await db.insert(users).values({ email: "staff@caedm.ca", status: "active" }).returning())[0]
  ).id;

// 2026-10-28 is MDT (UTC-6): 08:00 Edmonton = 14:00Z. 2026-11-02 is MST (UTC-7): 08:00 = 15:00Z.
const at = (iso: string) => Date.parse(iso);

async function addStory(
  db: Awaited<ReturnType<typeof testDb>>,
  slug: string,
  title: string,
  opts: { now: number; publishedAt?: number; baseline?: boolean; url?: string },
): Promise<number> {
  const src = await sourceBySlug(db, slug);
  return (await upsertStory(
    db,
    src,
    {
      title,
      url: opts.url ?? `https://example.org/${encodeURIComponent(title)}`,
      publishedAt: opts.publishedAt ?? opts.now - 3600_000,
      updatedAt: null,
      description: `Description for ${title}`,
      descriptionSource: "feed",
      categories: [],
    },
    { now: opts.now, rules: DEFAULT_PRIORITY_RULES, baseline: opts.baseline ?? false },
  ))!;
}

describe("morning digest", () => {
  let db: Awaited<ReturnType<typeof testDb>>;
  beforeEach(async () => {
    db = await testDb();
  });

  it("is not due before 08:00 Edmonton and runs once after, surviving restarts", async () => {
    await addStory(db, "ecsd", "School council meeting in Edmonton", { now: at("2026-10-28T05:00:00Z") });
    expect((await runScheduledDigest(db, at("2026-10-28T13:59:00Z"))).status).toBe("not_due");
    const r = await runScheduledDigest(db, at("2026-10-28T14:01:00Z"));
    expect(r).toMatchObject({ status: "created", dateKey: "2026-10-28", storyCount: 1 });
    // Simulated "restart": repeated ticks and a second worker do nothing.
    expect((await runScheduledDigest(db, at("2026-10-28T14:02:00Z"))).status).toBe("already_done");
    expect((await runScheduledDigest(db, at("2026-10-28T16:00:00Z"))).status).toBe("already_done");
    const rows = await db.select().from(notifications).where(eq(notifications.kind, "digest"));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("simulated");
    expect(rows[0].subject).toBe("CAEDM Morning News Brief | October 28, 2026");
    expect(rows[0].recipient).toBe("communications@caedm.ca");
  });

  it("uses Edmonton wall-clock time across the DST change", async () => {
    // Monday after fall-back: 08:00 MST = 15:00Z; 14:45Z is only 07:45 local.
    expect((await runScheduledDigest(db, at("2026-11-02T14:45:00Z"))).status).toBe("not_due");
    expect((await runScheduledDigest(db, at("2026-11-02T15:01:00Z"))).status).toBe("created");
    // Late-evening UTC still belongs to the Edmonton calendar day already sent.
    expect((await runScheduledDigest(db, at("2026-11-03T05:00:00Z"))).status).toBe("already_done");
  });

  it("never repeats a story in a later digest", async () => {
    await addStory(db, "covenant-health", "Hospital update one", { now: at("2026-10-28T06:00:00Z") });
    await runScheduledDigest(db, at("2026-10-28T14:01:00Z"));
    await addStory(db, "covenant-health", "Hospital update two", { now: at("2026-10-28T20:00:00Z") });
    const next = await runScheduledDigest(db, at("2026-10-29T14:01:00Z"));
    expect(next).toMatchObject({ status: "created", storyCount: 1 });
    const linked = await db.select().from(notificationStories).where(eq(notificationStories.kind, "digest"));
    expect(new Set(linked.map((l) => l.storyId)).size).toBe(linked.length);
  });

  it("produces a clear no-new-stories digest", async () => {
    const d = await buildDigest(db, at("2026-10-28T14:01:00Z"));
    expect(d.storyIds).toHaveLength(0);
    expect(d.html).toContain("No new stories from monitored sources since the last briefing.");
    expect(d.text).toContain("No outstanding follow-ups.");
  });

  it("excludes old baseline backlog and archived stories; lists follow-ups", async () => {
    const now = at("2026-10-28T14:01:00Z");
    await addStory(db, "vatican-news", "Old backlog item", { now, publishedAt: now - 10 * 86400_000, baseline: true });
    const archived = await addStory(db, "ecsd", "Archived item", { now: now - 3600_000 });
    await db.update(stories).set({ reviewStatus: "archived" }).where(eq(stories.id, archived));
    const fuStory = await addStory(db, "ecsd", "Needs follow up", { now: now - 7200_000 });
    const u = (await db.insert(users).values({ email: "a@caedm.ca", name: "Alex", status: "active" }).returning())[0];
    await db.insert(followUps).values({ storyId: fuStory, assigneeId: u.id, dueAt: now - 1000 });
    await db.update(stories).set({ reviewStatus: "assigned" }).where(eq(stories.id, fuStory));
    const d = await buildDigest(db, now);
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
    expect((await runScheduledDigest(db, at("2026-10-29T14:01:00Z"))).status).toBe("created");
    // Worker down for the whole window on the following day.
    expect((await runScheduledDigest(db, at("2026-10-30T19:00:00Z"))).status).toBe("missed");
    const last = (await db.select().from(notifications)).at(-1)!;
    expect(last).toMatchObject({ status: "skipped", dedupeKey: "digest:2026-10-30" });
  });

  it("preview does not consume stories from the scheduled digest", async () => {
    await addStory(db, "ecsd", "Preview candidate", { now: at("2026-10-28T08:00:00Z") });
    await createDigestPreviewNotification(db, at("2026-10-28T09:00:00Z"));
    expect(await runScheduledDigest(db, at("2026-10-28T14:01:00Z"))).toMatchObject({ status: "created", storyCount: 1 });
  });

  it("escapes publisher text in the HTML", async () => {
    const now = at("2026-10-28T14:01:00Z");
    await addStory(db, "ecsd", `<script>alert(1)</script> Edmonton school`, { now: now - 1000 });
    const d = await buildDigest(db, now);
    expect(d.html).not.toContain("<script>alert(1)</script>");
    expect(d.html).toContain("&lt;script&gt;");
  });
});

describe("personal briefs", () => {
  let db: Awaited<ReturnType<typeof testDb>>;
  beforeEach(async () => {
    db = await testDb();
  });
  afterEach(() => setTransportOverride(null));

  // 2026-10-28 is a Wednesday (MDT): 07:30 Edmonton = 13:30Z.
  const person = async (extra: Partial<typeof users.$inferInsert> = {}) =>
    (
      await db
        .insert(users)
        .values({ email: "reader@caedm.ca", name: "Reader", status: "active", notifyDigest: true, digestTime: "07:30", ...extra })
        .returning()
    )[0];
  const briefs = () => db.select().from(notifications).where(eq(notifications.kind, "brief"));

  it("is sent once at the person's own time, to them only", async () => {
    await person();
    await addStory(db, "caedm", "Archdiocese announces Advent schedule", { now: at("2026-10-28T06:00:00Z") });
    expect(await runPersonalBriefs(db, at("2026-10-28T13:29:00Z"))).toEqual({ sent: 0, empty: 0 });
    expect(await runPersonalBriefs(db, at("2026-10-28T13:31:00Z"))).toEqual({ sent: 1, empty: 0 });
    expect(await runPersonalBriefs(db, at("2026-10-28T13:46:00Z"))).toEqual({ sent: 0, empty: 0 });
    const [b] = await briefs();
    expect(b).toMatchObject({ recipient: "reader@caedm.ca", status: "simulated", subject: "Your CAEDM News Brief | October 28, 2026" });
    expect(b.html).toContain("Hello Reader,");
    expect(b.html).toContain("Archdiocese announces Advent schedule");
    // The team brief still has its own story and its own recipient.
    expect(await runScheduledDigest(db, at("2026-10-28T14:01:00Z"))).toMatchObject({ status: "created", storyCount: 1 });
  });

  it("follows the team time when no time is chosen", async () => {
    await person({ digestTime: null });
    await addStory(db, "caedm", "Archdiocese news", { now: at("2026-10-28T06:00:00Z") });
    expect((await runPersonalBriefs(db, at("2026-10-28T13:59:00Z"))).sent).toBe(0);
    expect((await runPersonalBriefs(db, at("2026-10-28T14:01:00Z"))).sent).toBe(1);
  });

  it("filters to Catholic sources unless the person chose all news", async () => {
    const u = await person();
    await addStory(db, "vatican-news", "Pope Leo addresses synod", { now: at("2026-10-28T06:00:00Z") });
    await addStory(db, "alberta-news", "Alberta announces education funding", { now: at("2026-10-28T06:00:00Z") });
    await runPersonalBriefs(db, at("2026-10-28T13:31:00Z"));
    const [catholic] = await briefs();
    expect(catholic.html).toContain("Pope Leo addresses synod");
    expect(catholic.html).not.toContain("Alberta announces education funding");

    await db.update(users).set({ digestScope: "all" }).where(eq(users.id, u.id));
    await addStory(db, "alberta-news", "Alberta updates health policy", { now: at("2026-10-29T06:00:00Z") });
    await runPersonalBriefs(db, at("2026-10-29T13:31:00Z"));
    const all = (await briefs()).at(-1)!;
    expect(all.html).toContain("Alberta updates health policy");
    // Yesterday's stories were covered by yesterday's brief.
    expect(all.html).not.toContain("Pope Leo addresses synod");
  });

  it("skips weekends for weekday briefs and records quiet days without emailing", async () => {
    await person({ digestDays: "weekdays" });
    // Saturday 2026-10-31: nothing at all.
    expect(await runPersonalBriefs(db, at("2026-10-31T13:31:00Z"))).toEqual({ sent: 0, empty: 0 });
    // Wednesday with nothing new: a skipped record, no email.
    expect(await runPersonalBriefs(db, at("2026-10-28T13:31:00Z"))).toEqual({ sent: 0, empty: 1 });
    const [quiet] = await briefs();
    expect(quiet).toMatchObject({ status: "skipped", sentAt: null });
    expect(await runPersonalBriefs(db, at("2026-10-28T13:45:00Z"))).toEqual({ sent: 0, empty: 0 });
  });

  it("isn't sent late when no refresh ran near the chosen time", async () => {
    await person();
    await addStory(db, "caedm", "Archdiocese news", { now: at("2026-10-28T06:00:00Z") });
    expect(await runPersonalBriefs(db, at("2026-10-28T18:00:00Z"))).toEqual({ sent: 0, empty: 0 });
  });

  it("send-now emails the last day immediately, once a minute, without moving the schedule", async () => {
    const u = await person();
    await addStory(db, "caedm", "Archdiocese news", { now: at("2026-10-28T06:00:00Z") });
    const now = at("2026-10-28T12:00:00Z");
    expect(await sendBriefNow(u.id, db, now)).toMatchObject({ status: "simulated", storyCount: 1, recipient: "reader@caedm.ca" });
    await expect(sendBriefNow(u.id, db, now + 5_000)).rejects.toThrow(/wait a minute/);
    // The scheduled brief later the same morning still includes the story.
    await runPersonalBriefs(db, at("2026-10-28T13:31:00Z"));
    const scheduled = (await briefs()).find((b) => b.dedupeKey.startsWith("brief:"))!;
    expect(scheduled.html).toContain("Archdiocese news");
  });

  it("reports a failed delivery and queues a retry", async () => {
    const u = await person();
    setTransportOverride({
      name: "smtp",
      send: async () => {
        throw new Error("connect ETIMEDOUT");
      },
    });
    const r = await sendBriefNow(u.id, db, at("2026-10-28T12:00:00Z"));
    expect(r).toMatchObject({ status: "failed", error: "connect ETIMEDOUT" });
  });

  it("lists only the person's own follow-ups", async () => {
    const u = await person();
    const other = (await db.insert(users).values({ email: "other@caedm.ca", name: "Other", status: "active" }).returning())[0];
    const mine = await addStory(db, "caedm", "Mine to cover", { now: at("2026-10-28T06:00:00Z") });
    const theirs = await addStory(db, "caedm", "Theirs to cover", { now: at("2026-10-28T06:00:00Z") });
    await db.insert(followUps).values([
      { storyId: mine, assigneeId: u.id },
      { storyId: theirs, assigneeId: other.id },
    ]);
    await db.update(stories).set({ reviewStatus: "assigned" });
    await runPersonalBriefs(db, at("2026-10-28T13:31:00Z"));
    const [b] = await briefs();
    expect(b.text).toMatch(/YOUR FOLLOW-UPS\n- Mine to cover/);
    expect(b.text).not.toMatch(/- Theirs to cover —/);
  });
});

describe("high-priority alerts", () => {
  let db: Awaited<ReturnType<typeof testDb>>;
  const noon = at("2026-10-28T18:00:00Z"); // 12:00 MDT, inside 07:00–21:00
  const night = at("2026-10-29T05:00:00Z"); // 23:00 MDT
  beforeEach(async () => {
    db = await testDb();
  });
  afterEach(() => setTransportOverride(null));

  it("alerts only qualifying P0/P1 stories, once, batched", async () => {
    const p1 = await addStory(db, "covenant-health", "Misericordia hospital announces new safety model", { now: noon - 60_000 });
    const p2 = await addStory(db, "ecsd", "Bus driver appreciation day", { now: noon - 60_000 });
    const p0 = await addStory(db, "caedm", "Archbishop of Edmonton hospitalized in emergency", { now: noon - 60_000 });
    const priorities = Object.fromEntries((await db.select().from(stories)).map((s) => [s.id, s.priority]));
    expect([priorities[p0], priorities[p1], priorities[p2]]).toEqual(["P0", "P1", "P2"]);

    const r = await processAlerts(db, noon);
    expect(r.status).toBe("created");
    if (r.status === "created") expect(r.storyIds.sort()).toEqual([p0, p1].sort());
    const alert = (await first(db.select().from(notifications).where(eq(notifications.kind, "alert"))))!;
    expect(alert.status).toBe("simulated");
    expect(alert.subject).toMatch(/P0 News Alert: 2 high-priority stories/);
    expect((await processAlerts(db, noon + 60_000)).status).toBe("none");
  });

  it("never alerts on baseline backlog or old detections", async () => {
    await addStory(db, "caedm", "Archbishop of Edmonton hospitalized in emergency", { now: noon, baseline: true });
    await addStory(db, "caedm", "Archdiocese of Edmonton emergency closure", { now: noon - 7 * 3600_000 });
    expect((await evaluateAlerts(db, noon)).eligible).toHaveLength(0);
  });

  it("holds P1 outside alert hours but lets P0 through when configured", async () => {
    await addStory(db, "covenant-health", "Misericordia hospital announces new safety model", { now: night - 60_000 });
    let ev = await evaluateAlerts(db, night);
    expect(ev.eligible).toHaveLength(0);
    expect(ev.held[0].held).toMatch(/Outside alert hours/);
    await addStory(db, "caedm", "Archbishop of Edmonton hospitalized in emergency", { now: night - 60_000 });
    ev = await evaluateAlerts(db, night);
    expect(ev.eligible.map((e) => e.priority)).toEqual(["P0"]);
    await setSettings({ alertP0BypassWindow: false }, null, db);
    expect((await evaluateAlerts(db, night)).eligible).toHaveLength(0);
  });

  it("enforces flood limits and records the suppression", async () => {
    await setSettings({ alertMaxPerHour: 1 }, null, db);
    await addStory(db, "caedm", "Archdiocese of Edmonton emergency statement one", { now: noon - 60_000 });
    expect((await processAlerts(db, noon)).status).toBe("created");
    await addStory(db, "caedm", "Archdiocese of Edmonton urgent closure two", { now: noon + 60_000 });
    const r = await processAlerts(db, noon + 120_000);
    expect(r.status).toBe("rate_limited");
    const skipped = (await first(db.select().from(notifications).where(eq(notifications.status, "skipped"))))!;
    expect(skipped.lastError).toMatch(/Hourly alert limit/);
    expect((await processAlerts(db, noon + 180_000)).status).toBe("none");
  });

  it("labels sensitive claims as internal review, not established fact", async () => {
    await addStory(db, "manual", "Allegations reported involving Edmonton Catholic parish investigation", { now: noon - 60_000 });
    const s = (await first(db.select().from(stories)))!;
    await overridePriority(s.id, "P1", "Needs Communications awareness", await staff(db), db);
    const r = await processAlerts(db, noon);
    expect(r.status).toBe("created");
    const n = (await first(db.select().from(notifications).where(eq(notifications.kind, "alert"))))!;
    expect(n.subject.startsWith("[INTERNAL REVIEW – UNVERIFIED]")).toBe(true);
    expect(n.html).toContain("not as established facts");
  });

  it("manual override to P1 makes an older story eligible", async () => {
    const id = await addStory(db, "ecsd", "Bus driver appreciation day", { now: noon - 2 * 86400_000 });
    expect((await evaluateAlerts(db, noon)).eligible).toHaveLength(0);
    await overridePriority(id, "P1", "Media interest", await staff(db), db);
    expect((await evaluateAlerts(db, noon)).eligible.map((e) => e.id)).toEqual([id]);
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
    await addStory(db, "caedm", "Archdiocese of Edmonton emergency statement", { now: noon - 60_000 });
    await processAlerts(db, noon);
    let n = (await first(db.select().from(notifications).where(eq(notifications.kind, "alert"))))!;
    expect(n).toMatchObject({ status: "failed", attempts: 1, lastError: "SMTP 451 temporary failure" });
    expect(n.nextAttemptAt).toBe(noon + 60_000);
    expect(await retryDeliveries(db, noon + 30_000)).toBe(0); // backoff not elapsed
    await retryDeliveries(db, noon + 61_000);
    n = (await first(db.select().from(notifications).where(eq(notifications.id, n.id))))!;
    expect(n).toMatchObject({ status: "failed", attempts: 2 });
    await retryDeliveries(db, noon + 61_000 + 5 * 60_000);
    n = (await first(db.select().from(notifications).where(eq(notifications.id, n.id))))!;
    expect(n).toMatchObject({ status: "sent", attempts: 3, transport: "test" });
    // A sent message is never re-sent.
    await deliverNotification(n.id, db);
    expect(attempts).toBe(3);
  });
});
