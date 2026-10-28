import * as cheerio from "cheerio";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "./audit";
import { first, getDb, type DB } from "./db/client";
import { CATEGORIES, GEO, sources, stories } from "./db/schema";
import { ADAPTERS } from "./ingest/adapters";
import { politeFetch, type Fetcher } from "./ingest/collector";
/** Feed addresses are stored exactly as published (story-URL normalization would strip a meaningful trailing slash). */
const feedAddress = (u: string) => new URL(u.trim()).toString();

export const ORG_TYPES = ["archdiocese", "catholic_partner", "catholic_national", "vatican", "government", "media"] as const;
export const ORG_TYPE_LABELS: Record<(typeof ORG_TYPES)[number], string> = {
  archdiocese: "Archdiocese of Edmonton",
  catholic_partner: "Catholic partner organization",
  catholic_national: "Canadian Catholic organization",
  vatican: "Vatican / Holy See",
  government: "Government / public body",
  media: "News media (third-party reporting)",
};

const httpUrl = z
  .string()
  .trim()
  .url("Enter a full web address starting with https://")
  .refine((u) => /^https?:\/\//i.test(u), "Only http(s) addresses are allowed");

export const sourceInputSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(100),
  websiteUrl: httpUrl,
  feedUrl: httpUrl,
  orgType: z.enum(ORG_TYPES),
  region: z.enum(GEO),
  importance: z.coerce.number().int().min(1).max(5),
  defaultCategory: z.enum(CATEGORIES),
  checkIntervalMinutes: z.union([z.literal(""), z.coerce.number().int().min(15).max(1440)]).transform((v) => (v === "" ? null : v)),
  notes: z.string().trim().max(1000).default(""),
  enabled: z.boolean(),
});
export type SourceInput = z.infer<typeof sourceInputSchema>;

export type FeedTestResult =
  | { ok: true; itemCount: number; sample: { title: string; url: string; publishedAt: number | null }[] }
  | { ok: false; error: string };

/** Feeds the site itself advertises (<link rel="alternate">). We never guess endpoints. */
export async function discoverFeeds(websiteUrl: string, fetcher: Fetcher = politeFetch): Promise<{ url: string; title: string }[]> {
  const res = await fetcher(websiteUrl);
  const $ = cheerio.load(res.body);
  const found: { url: string; title: string }[] = [];
  $('link[rel~="alternate"]').each((_, el) => {
    const type = ($(el).attr("type") ?? "").toLowerCase();
    const href = $(el).attr("href");
    if (!href || !/(rss|atom)\+xml|application\/feed\+json/.test(type)) return;
    try {
      const url = new URL(href, res.url).toString();
      if (!/comments\/feed/.test(url) && !found.some((f) => f.url === url)) found.push({ url, title: $(el).attr("title")?.trim() || type });
    } catch {
      /* ignore malformed hrefs */
    }
  });
  return found;
}

/** Fetch the feed/newsroom exactly as monitoring would (robots.txt + SSRF guard) and parse it. */
export async function testSourceFeed(feedUrl: string, adapterId = "rss", fetcher: Fetcher = politeFetch, now = Date.now()): Promise<FeedTestResult> {
  const adapter = ADAPTERS[adapterId];
  if (!adapter) return { ok: false, error: `Unknown adapter "${adapterId}"` };
  try {
    const out = await adapter.collect(
      { feedUrl, websiteUrl: feedUrl },
      // Treat everything as already known so test runs never fetch individual article pages.
      { fetch: fetcher, knownUrls: async (urls) => new Set(urls), isBaseline: false, now, log: () => {} },
    );
    if (!out.items.length) return { ok: false, error: out.warnings[0] ?? "The page was read, but no news items were found." };
    return {
      ok: true,
      itemCount: out.items.length,
      sample: out.items.slice(0, 5).map((i) => ({ title: i.title, url: i.url, publishedAt: i.publishedAt })),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function uniqueSlug(db: DB, name: string) {
  const base =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "source";
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await first(db.select({ id: sources.id }).from(sources).where(eq(sources.slug, slug))))) return slug;
  }
}

/** New administrator-managed sources always use the RSS/Atom adapter (newsroom scrapers are code-reviewed). */
export async function createSource(input: SourceInput, adminId: number, opts: { db?: DB; fetcher?: Fetcher; now?: number } = {}) {
  const db = opts.db ?? getDb();
  const now = opts.now ?? Date.now();
  const test = await testSourceFeed(input.feedUrl, "rss", opts.fetcher, now);
  if (!test.ok) throw new Error(`The feed could not be verified: ${test.error}`);
  const [row] = await db
    .insert(sources)
    .values({
      slug: await uniqueSlug(db, input.name),
      name: input.name,
      websiteUrl: input.websiteUrl,
      feedUrl: feedAddress(input.feedUrl),
      method: "rss",
      adapter: "rss",
      orgType: input.orgType,
      region: input.region,
      importance: input.importance,
      defaultCategory: input.defaultCategory,
      checkIntervalMinutes: input.checkIntervalMinutes,
      notes: input.notes || null,
      verified: true,
      verifiedAt: now,
      verifiedBy: adminId,
      enabled: input.enabled,
      nextCheckAt: input.enabled ? now : null,
      origin: "admin",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await audit("source.created", "source", row.id, adminId, { name: row.name, feedUrl: row.feedUrl, itemCount: test.itemCount }, db);
  return { source: row, test };
}

/** Edits keep the source's adapter. A changed feed URL is re-verified before it is saved. */
export async function updateSource(id: number, input: SourceInput, adminId: number, opts: { db?: DB; fetcher?: Fetcher; now?: number } = {}) {
  const db = opts.db ?? getDb();
  const now = opts.now ?? Date.now();
  const existing = await first(db.select().from(sources).where(eq(sources.id, id)));
  if (!existing || existing.method === "manual" || existing.slug === "sample") throw new Error("This source can't be edited.");
  const adapter = existing.adapter === "none" ? "rss" : existing.adapter;
  const feedUrl = feedAddress(input.feedUrl);
  const feedChanged = feedUrl !== existing.feedUrl || !existing.verified;
  let verification: Partial<typeof sources.$inferInsert> = {};
  let test: FeedTestResult | null = null;
  if (feedChanged) {
    test = await testSourceFeed(feedUrl, adapter, opts.fetcher, now);
    if (!test.ok) throw new Error(`The feed could not be verified: ${test.error}`);
    verification = {
      verified: true,
      verifiedAt: now,
      verifiedBy: adminId,
      adapter,
      method: adapter === "rss" ? "rss" : existing.method,
      consecutiveFailures: 0,
      lastError: null,
    };
  }
  const enabling = input.enabled && !existing.enabled;
  await db
    .update(sources)
    .set({
      name: input.name,
      websiteUrl: input.websiteUrl,
      feedUrl,
      orgType: input.orgType,
      region: input.region,
      importance: input.importance,
      defaultCategory: input.defaultCategory,
      checkIntervalMinutes: input.checkIntervalMinutes,
      notes: input.notes || null,
      enabled: input.enabled,
      ...verification,
      ...(enabling || feedChanged ? { nextCheckAt: now } : {}),
      updatedAt: now,
    })
    .where(eq(sources.id, id));
  const changed = Object.fromEntries(
    (["name", "websiteUrl", "orgType", "region", "importance", "defaultCategory", "checkIntervalMinutes", "enabled"] as const)
      .filter((k) => existing[k] !== input[k])
      .map((k) => [k, { from: existing[k], to: input[k] }]),
  );
  if (feedChanged) changed.feedUrl = { from: existing.feedUrl, to: feedUrl };
  await audit("source.updated", "source", id, adminId, changed, db);
  return { test };
}

/** Only sources without stored stories can be deleted; otherwise disable them to keep history intact. */
export async function deleteSource(id: number, adminId: number, db: DB = getDb()) {
  const existing = await first(db.select().from(sources).where(eq(sources.id, id)));
  if (!existing || existing.method === "manual") throw new Error("This source can't be deleted.");
  const used = await first(
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(stories)
      .where(eq(stories.sourceId, id)),
  );
  if (used && used.n > 0) throw new Error(`This source has ${used.n} stories. Disable it instead so its history is kept.`);
  await db.delete(sources).where(eq(sources.id, id));
  await audit("source.deleted", "source", id, adminId, { name: existing.name, feedUrl: existing.feedUrl }, db);
}
