import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { first, getDb, type DB } from "../db/client";
import { sourceCheckLogs, sources, stories, storyPriorityHistory, storySources, type Source } from "../db/schema";
import { classifyStory, type SourceProfile } from "../priority/classify";
import type { PriorityRules } from "../priority/rules";
import { getSettings } from "../settings";
import { ADAPTERS, type AdapterContext, type RawItem } from "./adapters";
import { parseArticleMeta } from "./adapters/parsers";
import { assertRobotsAllowed } from "./robots";
import { safeFetch, type SafeFetchResult } from "./safe-fetch";
import { cleanText, fingerprintSimilarity, normalizeUrl, sha256, titleFingerprint } from "./url";

export type Fetcher = (url: string) => Promise<SafeFetchResult>;

/** Default fetcher: robots.txt check, then SSRF-safe fetch. */
export const politeFetch: Fetcher = async (url) => {
  await assertRobotsAllowed(url);
  return safeFetch(url);
};

export type CheckResult = {
  sourceId: number;
  slug: string;
  status: "success" | "error";
  itemsFound: number;
  itemsNew: number;
  newStoryIds: number[];
  error?: string;
  warnings: string[];
};

const MAX_BACKOFF_MINUTES = 360;

export function profileOf(source: Source): SourceProfile {
  return {
    name: source.name,
    orgType: source.orgType,
    region: source.region,
    importance: source.importance,
    defaultCategory: source.defaultCategory,
  };
}

async function findGroupKey(db: DB, fingerprint: string, now: number): Promise<string> {
  const recent = await db
    .select({ groupKey: stories.groupKey, fp: stories.titleFingerprint })
    .from(stories)
    .where(gte(stories.firstDetectedAt, now - 14 * 24 * 3600_000));
  let best: { key: string; sim: number } | null = null;
  for (const r of recent) {
    const sim = fingerprintSimilarity(fingerprint, r.fp);
    if (sim >= 0.6 && (!best || sim > best.sim)) best = { key: r.groupKey, sim };
  }
  return best?.key ?? `g_${sha256(fingerprint || String(now)).slice(0, 16)}`;
}

/** Insert a new story or merge into an existing one. Returns the new story id, or null if it existed. */
export async function upsertStory(
  db: DB,
  source: Source,
  item: RawItem,
  opts: { now: number; rules: PriorityRules; baseline: boolean; isSample?: boolean; descriptionSourceOverride?: "staff" },
): Promise<number | null> {
  const url = normalizeUrl(item.url);
  const existing = await first(db.select().from(stories).where(eq(stories.canonicalUrl, url)));
  if (existing) {
    await db.insert(storySources).values({ storyId: existing.id, sourceId: source.id, url, detectedAt: opts.now }).onConflictDoNothing();
    const patch: Partial<typeof stories.$inferInsert> = {};
    if (item.updatedAt && item.updatedAt !== existing.sourceUpdatedAt && item.updatedAt > (existing.publishedAt ?? 0)) {
      patch.sourceUpdatedAt = item.updatedAt;
    }
    if (!existing.publishedAt && item.publishedAt) patch.publishedAt = item.publishedAt;
    if (!existing.description && item.description) {
      patch.description = item.description;
      patch.descriptionSource = item.descriptionSource;
    }
    if (Object.keys(patch).length)
      await db
        .update(stories)
        .set({ ...patch, updatedAt: opts.now })
        .where(eq(stories.id, existing.id));
    return null;
  }

  const fingerprint = titleFingerprint(item.title);
  const c = classifyStory(
    { title: item.title, description: item.description, publishedAt: item.publishedAt, source: profileOf(source) },
    opts.rules,
    opts.now,
  );
  // ON CONFLICT guards the race where two concurrent refreshes find the same new article.
  const inserted = await first(
    db
      .insert(stories)
      .values({
        title: item.title,
        canonicalUrl: url,
        titleFingerprint: fingerprint,
        groupKey: await findGroupKey(db, fingerprint, opts.now),
        description: item.description,
        descriptionSource: opts.descriptionSourceOverride ?? item.descriptionSource,
        sourceId: source.id,
        publishedAt: item.publishedAt,
        firstDetectedAt: opts.now,
        sourceUpdatedAt: item.updatedAt,
        category: c.category,
        geoRelevance: c.geoRelevance,
        priority: c.priority,
        priorityScore: c.score,
        priorityReason: c.reason,
        verificationStatus: c.verificationStatus,
        sensitive: c.sensitive,
        reviewStatus: "new",
        alertSuppressed: opts.baseline,
        isSample: opts.isSample ?? false,
        createdAt: opts.now,
        updatedAt: opts.now,
      })
      .onConflictDoNothing({ target: stories.canonicalUrl })
      .returning({ id: stories.id }),
  );
  if (!inserted) return null;
  await db.insert(storySources).values({ storyId: inserted.id, sourceId: source.id, url, detectedAt: opts.now });
  await db
    .insert(storyPriorityHistory)
    .values({ storyId: inserted.id, fromPriority: null, toPriority: c.priority, reason: `Classifier: ${c.reason}`, changedAt: opts.now });
  return inserted.id;
}

export async function checkSource(
  sourceId: number,
  opts: { trigger?: "schedule" | "manual"; db?: DB; now?: number; fetcher?: Fetcher; log?: (m: string) => void } = {},
): Promise<CheckResult> {
  const db = opts.db ?? getDb();
  const startedAt = opts.now ?? Date.now();
  const log = opts.log ?? (() => {});
  const settings = await getSettings(db);
  const source = await first(db.select().from(sources).where(eq(sources.id, sourceId)));
  if (!source) throw new Error(`Source ${sourceId} not found`);
  const intervalMin = source.checkIntervalMinutes ?? settings.checkIntervalMinutes;
  const result: CheckResult = { sourceId, slug: source.slug, status: "success", itemsFound: 0, itemsNew: 0, newStoryIds: [], warnings: [] };
  let httpStatus: number | null = null;

  try {
    if (!source.verified) throw new Error("Source is not verified; monitoring is disabled");
    const adapter = ADAPTERS[source.adapter];
    if (!adapter || !source.feedUrl) throw new Error(`No adapter configured (${source.adapter})`);
    const baseline = source.lastSuccessAt == null;
    const ctx: AdapterContext = {
      fetch: opts.fetcher ?? politeFetch,
      knownUrls: async (urls) => {
        if (!urls.length) return new Set();
        const rows = await db.select({ u: stories.canonicalUrl }).from(stories).where(inArray(stories.canonicalUrl, urls));
        return new Set(rows.map((r) => r.u));
      },
      isBaseline: baseline,
      now: startedAt,
      log,
    };
    const out = await adapter.collect({ feedUrl: source.feedUrl, websiteUrl: source.websiteUrl }, ctx);
    httpStatus = out.httpStatus;
    result.warnings.push(...out.warnings);
    result.itemsFound = out.items.length;
    let latestArticle = source.lastArticleAt ?? 0;
    await db.transaction(async (tx) => {
      for (const item of out.items) {
        const id = await upsertStory(tx as unknown as DB, source, item, { now: startedAt, rules: settings.priorityRules, baseline });
        if (id) result.newStoryIds.push(id);
        if (item.publishedAt && item.publishedAt > latestArticle) latestArticle = item.publishedAt;
      }
    });
    result.itemsNew = result.newStoryIds.length;
    const finishedAt = Date.now();
    await db
      .update(sources)
      .set({
        lastCheckedAt: startedAt,
        lastSuccessAt: finishedAt,
        lastArticleAt: latestArticle || source.lastArticleAt,
        consecutiveFailures: 0,
        lastError: out.warnings.length && !out.items.length ? out.warnings[0] : null,
        nextCheckAt: startedAt + intervalMin * 60_000,
        updatedAt: finishedAt,
      })
      .where(eq(sources.id, source.id));
    log(`[collect] ${source.slug}: ${result.itemsFound} found, ${result.itemsNew} new${baseline ? " (baseline)" : ""}`);
  } catch (e) {
    const err = e as Error & { status?: number };
    result.status = "error";
    result.error = err.message;
    httpStatus = err.status ?? httpStatus;
    const failures = source.consecutiveFailures + 1;
    const backoff = Math.min(intervalMin * 2 ** Math.min(failures, 6), MAX_BACKOFF_MINUTES);
    await db
      .update(sources)
      .set({
        lastCheckedAt: startedAt,
        consecutiveFailures: failures,
        lastError: err.message.slice(0, 500),
        nextCheckAt: startedAt + backoff * 60_000,
        updatedAt: Date.now(),
      })
      .where(eq(sources.id, source.id));
    log(`[collect] ${source.slug}: ERROR ${err.message} (failure #${failures}, retry in ${backoff} min)`);
  }

  const finishedAt = Date.now();
  await db.insert(sourceCheckLogs).values({
    sourceId: source.id,
    startedAt,
    finishedAt,
    status: result.status,
    httpStatus,
    itemsFound: result.itemsFound,
    itemsNew: result.itemsNew,
    durationMs: finishedAt - startedAt,
    error: result.error ?? (result.warnings.length ? `Warnings: ${result.warnings.slice(0, 3).join(" | ")}` : null),
    trigger: opts.trigger ?? "schedule",
  });
  return result;
}

/**
 * Check every enabled, verified source whose next check is due. Sources are on different hosts, so they run
 * in parallel (per-host politeness is enforced inside safeFetch); one failing source never affects another.
 */
export async function runDueChecks(opts: { db?: DB; now?: number; fetcher?: Fetcher; log?: (m: string) => void; force?: boolean } = {}) {
  const db = opts.db ?? getDb();
  const now = opts.now ?? Date.now();
  const due = await db
    .select()
    .from(sources)
    .where(
      and(
        eq(sources.enabled, true),
        eq(sources.verified, true),
        inArray(sources.method, ["rss", "html"]),
        opts.force ? undefined : or(isNull(sources.nextCheckAt), lte(sources.nextCheckAt, now)),
      ),
    );
  const settled = await Promise.allSettled(due.map((s) => checkSource(s.id, { ...opts, db, trigger: "schedule" })));
  const results: CheckResult[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") results.push(r.value);
    else opts.log?.(`[collect] ${due[i].slug}: unexpected failure ${(r.reason as Error).message}`);
  });
  return results;
}

/** Re-run the classifier on stories that have not been manually overridden. */
export async function reclassifyAll(db: DB = getDb(), now = Date.now()) {
  const settings = await getSettings(db);
  const srcById = new Map((await db.select().from(sources)).map((s) => [s.id, s]));
  const rows = await db.select().from(stories).where(eq(stories.priorityOverridden, false));
  let changed = 0;
  await db.transaction(async (tx) => {
    for (const s of rows) {
      const src = srcById.get(s.sourceId);
      if (!src) continue;
      const c = classifyStory(
        { title: s.title, description: s.description, publishedAt: s.publishedAt ?? s.firstDetectedAt, source: profileOf(src) },
        settings.priorityRules,
        now,
      );
      if (c.priority !== s.priority) {
        changed++;
        await tx
          .insert(storyPriorityHistory)
          .values({ storyId: s.id, fromPriority: s.priority, toPriority: c.priority, reason: `Reclassified: ${c.reason}`, changedAt: now });
      }
      await tx
        .update(stories)
        .set({
          priority: c.priority,
          priorityScore: c.score,
          priorityReason: c.reason,
          category: c.category,
          geoRelevance: c.geoRelevance,
          sensitive: c.sensitive,
          updatedAt: now,
        })
        .where(eq(stories.id, s.id));
    }
  });
  return { total: rows.length, changed };
}

/**
 * Manual link submission (fallback for sources that cannot be monitored). Reads publisher metadata only if
 * robots.txt allows; otherwise staff must supply the headline. Stored as unverified.
 */
export async function submitManualLink(
  input: { url: string; title?: string; description?: string },
  opts: { db?: DB; now?: number; fetcher?: Fetcher } = {},
): Promise<{ storyId: number | null; duplicate: boolean; note?: string }> {
  const db = opts.db ?? getDb();
  const now = opts.now ?? Date.now();
  const url = normalizeUrl(input.url);
  const manual = await first(db.select().from(sources).where(eq(sources.slug, "manual")));
  if (!manual) throw new Error("Manual source missing — run db:setup");
  let meta: ReturnType<typeof parseArticleMeta> | null = null;
  let note: string | undefined;
  try {
    const res = await (opts.fetcher ?? politeFetch)(url);
    meta = parseArticleMeta(res.body, res.url, now);
  } catch (e) {
    note = `Metadata not fetched: ${(e as Error).message}`;
  }
  const title = cleanText(input.title, 300) ?? meta?.title;
  if (!title) throw new Error(`${note ?? "No headline found"}. Please enter the headline manually.`);
  const staffDescription = cleanText(input.description, 400);
  const description = staffDescription ?? meta?.description ?? null;
  const storyId = await upsertStory(
    db,
    manual,
    {
      title,
      url,
      publishedAt: meta?.publishedAt ?? null,
      updatedAt: meta?.updatedAt ?? null,
      description,
      descriptionSource: description ? "page_meta" : "none",
      categories: [],
    },
    { now, rules: (await getSettings(db)).priorityRules, baseline: false, descriptionSourceOverride: staffDescription ? "staff" : undefined },
  );
  return { storyId, duplicate: storyId === null, note };
}
