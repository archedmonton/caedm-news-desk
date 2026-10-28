import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { sourceCheckLogs, sources, stories, storySources } from "@/lib/db/schema";
import { parseAlbertaNewsroom, parseArticleMeta, parseCovenantNewsroom, parseEcsdListing, parseFeed } from "@/lib/ingest/adapters/parsers";
import { checkSource, runDueChecks, submitManualLink, upsertStory } from "@/lib/ingest/collector";
import { cleanText, normalizeUrl, parseDate, titleFingerprint } from "@/lib/ingest/url";
import { DEFAULT_PRIORITY_RULES } from "@/lib/priority/rules";
import { ALBERTA_HTML, COVENANT_HTML, ECSD_LISTING, ecsdArticle, VATICAN_RSS } from "../fixtures";
import { fakeFetcher, sourceBySlug, testDb } from "./helpers";

const NOW = Date.parse("2026-10-28T18:00:00Z");

describe("URL & text normalization", () => {
  it("normalizes URLs for dedupe while keeping meaningful params", () => {
    expect(normalizeUrl("https://WWW.Alberta.ca/announcements.cfm?xID=ABC&utm_source=x#top")).toBe("https://www.alberta.ca/announcements.cfm?xID=ABC");
    expect(normalizeUrl("https://example.org/a/b/?b=2&a=1")).toBe("https://example.org/a/b?a=1&b=2");
    expect(normalizeUrl("/news/x", "https://www.ecsd.net/news")).toBe("https://www.ecsd.net/news/x");
  });
  it("cleans HTML and truncates descriptions without inventing text", () => {
    expect(cleanText("<p>Hello&nbsp;<b>world</b> &amp; friends</p>")).toBe("Hello world & friends");
    const long = "Word ".repeat(200);
    const out = cleanText(long, 100)!;
    expect(out.length).toBeLessThanOrEqual(101);
    expect(out.endsWith("…")).toBe(true);
    expect(cleanText("   ")).toBeNull();
    expect(cleanText("<p>A summary of the visit. Read all</p>")).toBe("A summary of the visit.");
    expect(cleanText("Already read all the reports today")).toBe("Already read all the reports today");
  });
  it("parses publisher date formats and rejects far-future dates", () => {
    expect(parseDate("2026-10-14 20:28:48.533205 +0000 UTC")).toBe(Date.parse("2026-10-14T20:28:48Z"));
    expect(parseDate("Wed, 28 Oct 2026 10:00:00 +0100")).toBe(Date.parse("2026-10-28T09:00:00Z"));
    expect(parseDate("2099-01-01T00:00:00Z", NOW)).toBeNull();
    expect(parseDate("not a date")).toBeNull();
  });
  it("fingerprints headlines order-insensitively", () => {
    expect(titleFingerprint("Pope Leo visits Rome parishes")).toBe(titleFingerprint("Rome parishes: Pope Leo visits"));
  });
});

describe("source parsers", () => {
  it("parses RSS with CDATA, strips tracking params and skips untitled items", async () => {
    const items = await parseFeed(VATICAN_RSS, "https://www.vaticannews.va/en.rss.xml", NOW);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Pope Leo announces consistory for new cardinals");
    expect(items[0].url).toBe("https://www.vaticannews.va/en/pope/news/2026-10/test-consistory.html");
    expect(items[0].description).toBe("The Holy Father announced a consistory in a test fixture.");
    expect(items[0].publishedAt).toBe(Date.parse("2026-10-28T09:00:00Z"));
  });
  it("rejects non-feed responses", async () => {
    await expect(parseFeed("<html><body>Not a feed</body></html>", "https://x.test")).rejects.toThrow(/not an RSS/);
  });
  it("parses the Alberta newsroom with precise timestamps where available", () => {
    const items = parseAlbertaNewsroom(ALBERTA_HTML, "https://www.alberta.ca/news");
    expect(items).toHaveLength(2);
    expect(items[0].publishedAt).toBe(Date.parse("2026-10-27T15:30:00Z"));
    expect(items[0].description).toMatch(/^Alberta’s government announces/);
    // Date-only entries resolve to midnight Edmonton time (MDT, UTC-6).
    expect(items[1].publishedAt).toBe(Date.parse("2026-10-26T06:00:00Z"));
  });
  it("parses the Covenant Health newsroom", () => {
    const items = parseCovenantNewsroom(COVENANT_HTML, "https://covenanthealth.ca/news-and-events/news");
    expect(items.map((i) => i.url)).toEqual(["https://covenanthealth.ca/news-and-events/news/test-safety", "https://covenanthealth.ca/news-and-events/news/test-meet"]);
    expect(items[0].categories).toEqual(["Safety"]);
    expect(items[0].description).toMatch(/Fixture lede/);
  });
  it("parses ECSD listing (deduplicated) and tolerant JSON-LD", () => {
    expect(parseEcsdListing(ECSD_LISTING, "https://www.ecsd.net/news")).toHaveLength(2);
    const meta = parseArticleMeta(ecsdArticle("2026-10-14 20:28:48.533205 +0000 UTC"), "https://www.ecsd.net/news/test-opening");
    expect(meta.publishedAt).toBe(Date.parse("2026-10-14T20:28:48Z"));
    expect(meta.title).toBe("Grand opening of a test Catholic school");
    expect(meta.description).toBe("Fixture description of the opening.");
  });
  it("survives malformed markup", () => {
    expect(parseCovenantNewsroom("<div><article><h2><a>", "https://covenanthealth.ca")).toEqual([]);
    expect(parseArticleMeta('<script type="application/ld+json">{bad json</script>', "https://x.test").publishedAt).toBeNull();
  });
});

describe("collector", () => {
  let db: ReturnType<typeof testDb>;
  beforeEach(() => {
    db = testDb();
  });

  const routes = {
    "https://www.vaticannews.va/en.rss.xml": VATICAN_RSS,
    "https://www.alberta.ca/news": ALBERTA_HTML,
    "https://covenanthealth.ca/news-and-events/news": COVENANT_HTML,
    "https://www.ecsd.net/news": ECSD_LISTING,
    "https://www.ecsd.net/news/test-opening": ecsdArticle("2026-10-27 20:00:00.0 +0000 UTC"),
    "https://www.ecsd.net/news/test-budget": ecsdArticle("2026-10-26 20:00:00.0 +0000 UTC"),
  };

  it("stores stories, prevents duplicates and records health", async () => {
    const { fetcher } = fakeFetcher(routes);
    const vat = sourceBySlug(db, "vatican-news");
    const first = await checkSource(vat.id, { db, fetcher, now: NOW });
    expect(first).toMatchObject({ status: "success", itemsFound: 2, itemsNew: 2 });
    const second = await checkSource(vat.id, { db, fetcher, now: NOW + 60_000 });
    expect(second.itemsNew).toBe(0);
    expect(db.select().from(stories).all()).toHaveLength(2);
    const after = sourceBySlug(db, "vatican-news");
    expect(after.consecutiveFailures).toBe(0);
    expect(after.lastSuccessAt).not.toBeNull();
    expect(after.nextCheckAt).toBe(NOW + 60_000 + 30 * 60_000);
    expect(db.select().from(sourceCheckLogs).all()).toHaveLength(2);
  });

  it("marks the first (baseline) sync as alert-suppressed but not later items", async () => {
    const vat = sourceBySlug(db, "vatican-news");
    await checkSource(vat.id, { db, fetcher: fakeFetcher(routes).fetcher, now: NOW });
    expect(db.select().from(stories).all().every((s) => s.alertSuppressed)).toBe(true);
    const later = VATICAN_RSS.replace("test-peace.html", "test-new.html").replace("Regional conference", "Another item");
    await checkSource(vat.id, { db, fetcher: fakeFetcher({ "https://www.vaticannews.va/en.rss.xml": later }).fetcher, now: NOW + 3600_000 });
    const fresh = db.select().from(stories).where(eq(stories.canonicalUrl, "https://www.vaticannews.va/en/world/news/2026-10/test-new.html")).get()!;
    expect(fresh.alertSuppressed).toBe(false);
  });

  it("keeps working when one source fails, with exponential backoff", async () => {
    const broken = { ...routes, "https://www.alberta.ca/news": new Error("connect ECONNREFUSED") };
    const { fetcher } = fakeFetcher(broken);
    const results = await runDueChecks({ db, fetcher, now: NOW });
    const bySlug = Object.fromEntries(results.map((r) => [r.slug, r]));
    expect(bySlug["alberta-news"].status).toBe("error");
    expect(bySlug["vatican-news"].status).toBe("success");
    expect(bySlug["covenant-health"].status).toBe("success");
    expect(bySlug["ecsd"].status).toBe("success");
    let ab = sourceBySlug(db, "alberta-news");
    expect(ab.consecutiveFailures).toBe(1);
    expect(ab.nextCheckAt).toBe(NOW + 60 * 60_000); // 30 min × 2^1
    expect(ab.lastError).toMatch(/ECONNREFUSED/);
    await checkSource(ab.id, { db, fetcher, now: NOW + 2 * 3600_000 });
    ab = sourceBySlug(db, "alberta-news");
    expect(ab.consecutiveFailures).toBe(2);
    expect(ab.nextCheckAt).toBe(NOW + 2 * 3600_000 + 120 * 60_000);
    // Recovery resets failures.
    await checkSource(ab.id, { db, fetcher: fakeFetcher(routes).fetcher, now: NOW + 5 * 3600_000 });
    expect(sourceBySlug(db, "alberta-news").consecutiveFailures).toBe(0);
  });

  it("enriches ECSD items from article metadata and does not refetch known items", async () => {
    const { fetcher, calls } = fakeFetcher(routes);
    const ecsd = sourceBySlug(db, "ecsd");
    await checkSource(ecsd.id, { db, fetcher, now: NOW });
    const stored = db.select().from(stories).where(eq(stories.sourceId, ecsd.id)).all();
    expect(stored).toHaveLength(2);
    expect(stored.every((s) => s.publishedAt && s.descriptionSource === "page_meta")).toBe(true);
    calls.length = 0;
    await checkSource(ecsd.id, { db, fetcher, now: NOW + 60_000 });
    expect(calls).toEqual(["https://www.ecsd.net/news"]);
  });

  it("only checks enabled, verified sources", async () => {
    db.update(sources).set({ enabled: false }).where(eq(sources.slug, "vatican-news")).run();
    const { calls } = fakeFetcher(routes);
    const res = await runDueChecks({ db, fetcher: fakeFetcher(routes).fetcher, now: NOW });
    expect(res.map((r) => r.slug).sort()).toEqual(["alberta-news", "covenant-health", "ecsd"]);
    expect(calls).toEqual([]);
    const unverified = sourceBySlug(db, "cbc-edmonton");
    expect((await checkSource(unverified.id, { db, fetcher: fakeFetcher(routes).fetcher, now: NOW })).error).toMatch(/not verified/);
  });

  it("records the same story reported by a second source and groups related headlines", () => {
    const vat = sourceBySlug(db, "vatican-news");
    const caedm = sourceBySlug(db, "caedm");
    const item = { title: "Pope Leo visits Edmonton parishes", url: "https://example.org/a", publishedAt: NOW, updatedAt: null, description: null, descriptionSource: "none" as const, categories: [] };
    const opts = { now: NOW, rules: DEFAULT_PRIORITY_RULES, baseline: false };
    const id = upsertStory(db, vat, item, opts)!;
    expect(upsertStory(db, caedm, item, opts)).toBeNull();
    expect(db.select().from(storySources).where(eq(storySources.storyId, id)).all()).toHaveLength(2);
    const relatedId = upsertStory(db, caedm, { ...item, url: "https://example.org/b", title: "Edmonton parishes: Pope Leo visits" }, opts)!;
    const [a, b] = [id, relatedId].map((x) => db.select().from(stories).where(eq(stories.id, x)).get()!);
    expect(a.groupKey).toBe(b.groupKey);
  });

  it("accepts manual links as unverified, requiring a headline when the page can't be read", async () => {
    const blocked = fakeFetcher({}).fetcher;
    await expect(submitManualLink({ url: "https://example.org/x" }, { db, fetcher: blocked, now: NOW })).rejects.toThrow(/headline/);
    const r = await submitManualLink({ url: "https://example.org/x", title: "Parish hall closure in Edmonton", description: "Staff summary." }, { db, fetcher: blocked, now: NOW });
    const s = db.select().from(stories).where(eq(stories.id, r.storyId!)).get()!;
    expect(s.verificationStatus).toBe("unverified");
    expect(s.descriptionSource).toBe("staff");
    expect((await submitManualLink({ url: "https://example.org/x?utm_source=a", title: "dup" }, { db, fetcher: blocked, now: NOW })).duplicate).toBe(true);
  });
});
