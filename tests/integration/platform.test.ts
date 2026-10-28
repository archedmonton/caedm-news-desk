import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as cronGET } from "@/app/api/cron/tick/route";
import { first } from "@/lib/db/client";
import { auditLogs, sources, stories, users } from "@/lib/db/schema";
import { seedSources } from "@/lib/db/seed";
import { resetEnvCache } from "@/lib/env";
import { acquireLease, releaseLease } from "@/lib/settings";
import { createSource, deleteSource, discoverFeeds, testSourceFeed, updateSource, type SourceInput } from "@/lib/sources-admin";
import { getTickState, hasDueSources, runTick } from "@/lib/tick";
import { VATICAN_RSS } from "../fixtures";
import { fakeFetcher, sourceBySlug, testDb } from "./helpers";

const NOW = Date.parse("2026-10-28T18:00:00Z");
const FEED = "https://partner.example.org/feed/";
const SITE = "https://partner.example.org/";
const routes = {
  [SITE]: `<html><head><link rel="alternate" type="application/rss+xml" title="Partner news" href="/feed/"><link rel="alternate" type="application/rss+xml" href="/comments/feed/"></head></html>`,
  [FEED]: VATICAN_RSS,
};
const input = (over: Partial<SourceInput> = {}): SourceInput => ({
  name: "Partner Org",
  websiteUrl: SITE,
  feedUrl: FEED,
  orgType: "catholic_partner",
  region: "edmonton",
  importance: 3,
  defaultCategory: "community",
  checkIntervalMinutes: null,
  notes: "",
  enabled: true,
  ...over,
});

let db: Awaited<ReturnType<typeof testDb>>;
let adminId: number;
beforeEach(async () => {
  db = await testDb();
  [{ id: adminId }] = await db.insert(users).values({ email: "admin@caedm.ca", role: "admin", status: "active" }).returning({ id: users.id });
});

describe("refresh lease", () => {
  it("allows one holder at a time and expires", async () => {
    expect(await acquireLease("x", 60_000, db, NOW)).toBe(true);
    expect(await acquireLease("x", 60_000, db, NOW + 1000)).toBe(false);
    expect(await acquireLease("x", 60_000, db, NOW + 61_000)).toBe(true);
    await releaseLease("x", db);
    expect(await acquireLease("x", 60_000, db, NOW + 62_000)).toBe(true);
  });

  it("runTick skips when another refresh holds the lease and records its state when it runs", async () => {
    await db.update(sources).set({ enabled: false });
    expect(await hasDueSources(db)).toBe(false);
    await acquireLease("tick", 5 * 60_000, db);
    expect((await runTick({ trigger: "manual", db })).status).toBe("busy");
    await releaseLease("tick", db);
    const r = await runTick({ trigger: "live", db });
    expect(r.status).toBe("ok");
    expect(await getTickState(db)).toMatchObject({ trigger: "live", checked: 0 });
  });
});

describe("cron endpoint", () => {
  const env0 = { ...process.env };
  afterEach(() => {
    process.env = { ...env0 };
    resetEnvCache();
  });
  const call = (auth?: string) => cronGET(new Request("http://localhost/api/cron/tick", { headers: auth ? { authorization: auth } : {} }));

  it("requires the CRON_SECRET bearer token", async () => {
    process.env.CRON_SECRET = "s3cret-value-for-tests";
    resetEnvCache();
    await db.update(sources).set({ enabled: false });
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    const ok = await call("Bearer s3cret-value-for-tests");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, status: "ok", checked: 0 });
  });

  it("refuses to run unauthenticated in production when no secret is configured", async () => {
    Object.assign(process.env, { NODE_ENV: "production", DATABASE_URL: "postgres://unused" });
    delete process.env.CRON_SECRET;
    resetEnvCache();
    expect((await call()).status).toBe(401);
  });
});

describe("seeding", () => {
  it("never overwrites an administrator's edits", async () => {
    await db.update(sources).set({ name: "Renamed by admin", importance: 1 }).where(eq(sources.slug, "vatican-news"));
    expect(await seedSources(db)).toBe(0);
    expect(await sourceBySlug(db, "vatican-news")).toMatchObject({ name: "Renamed by admin", importance: 1 });
  });
});

describe("administrator source management", () => {
  it("discovers only feeds the site advertises (ignoring comment feeds)", async () => {
    expect(await discoverFeeds(SITE, fakeFetcher(routes).fetcher)).toEqual([{ url: FEED, title: "Partner news" }]);
  });

  it("tests a feed the way monitoring reads it", async () => {
    const ok = await testSourceFeed(FEED, "rss", fakeFetcher(routes).fetcher, NOW);
    expect(ok).toMatchObject({ ok: true, itemCount: 2 });
    const bad = await testSourceFeed("https://partner.example.org/missing", "rss", fakeFetcher(routes).fetcher, NOW);
    expect(bad.ok).toBe(false);
  });

  it("creates a verified RSS source only after a successful test, and audits it", async () => {
    await expect(
      createSource(input({ feedUrl: "https://partner.example.org/missing" }), adminId, { db, fetcher: fakeFetcher(routes).fetcher }),
    ).rejects.toThrow(/could not be verified/);
    const { source } = await createSource(input(), adminId, { db, fetcher: fakeFetcher(routes).fetcher, now: NOW });
    expect(source).toMatchObject({
      slug: "partner-org",
      adapter: "rss",
      method: "rss",
      verified: true,
      enabled: true,
      origin: "admin",
      verifiedBy: adminId,
      nextCheckAt: NOW,
    });
    const again = await createSource(input(), adminId, { db, fetcher: fakeFetcher(routes).fetcher, now: NOW });
    expect(again.source.slug).toBe("partner-org-2");
    expect((await db.select().from(auditLogs).where(eq(auditLogs.action, "source.created"))).length).toBe(2);
  });

  it("verifies an expansion source when an admin adds its feed, and keeps adapters of pilot sources", async () => {
    const css = await sourceBySlug(db, "catholic-social-services");
    expect(css.verified).toBe(false);
    await updateSource(css.id, input({ name: "Catholic Social Services", enabled: true }), adminId, {
      db,
      fetcher: fakeFetcher(routes).fetcher,
      now: NOW,
    });
    expect(await sourceBySlug(db, "catholic-social-services")).toMatchObject({
      verified: true,
      enabled: true,
      adapter: "rss",
      feedUrl: FEED,
      verifiedBy: adminId,
    });

    const alberta = await sourceBySlug(db, "alberta-news");
    await updateSource(alberta.id, input({ name: "Government of Alberta", feedUrl: alberta.feedUrl!, importance: 2, enabled: false }), adminId, {
      db,
      now: NOW,
    });
    expect(await sourceBySlug(db, "alberta-news")).toMatchObject({ adapter: "alberta-newsroom", importance: 2, enabled: false });
  });

  it("deletes only sources without stories", async () => {
    const { source } = await createSource(input(), adminId, { db, fetcher: fakeFetcher(routes).fetcher, now: NOW });
    await db
      .insert(stories)
      .values({ title: "x", canonicalUrl: "https://example.org/x", titleFingerprint: "x", groupKey: "g", sourceId: source.id, firstDetectedAt: NOW });
    await expect(deleteSource(source.id, adminId, db)).rejects.toThrow(/Disable it instead/);
    await db.delete(stories).where(eq(stories.sourceId, source.id));
    await deleteSource(source.id, adminId, db);
    expect(await first(db.select().from(sources).where(eq(sources.id, source.id)))).toBeUndefined();
    await expect(deleteSource((await sourceBySlug(db, "manual")).id, adminId, db)).rejects.toThrow(/can't be deleted/);
  });
});
