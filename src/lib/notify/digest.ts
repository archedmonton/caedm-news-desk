import { and, desc, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
import { getDb, type DB } from "../db/client";
import { followUps, notifications, notificationStories, sources, stories, users, type Story } from "../db/schema";
import { env } from "../env";
import { getSettings } from "../settings";
import { edmontonDateKey, scheduledInstantForDay } from "../time";
import { deliverNotification } from "./deliver";
import { digestRecipients } from "./recipients";
import { renderDigest, type DigestFollowUp, type DigestSection, type EmailStory } from "./templates/emails";

const MAX_PER_SECTION = 8;
const MAX_WINDOW_HOURS = 72;
const CATCH_UP_HOURS = 4;
const RANK = { P0: 0, P1: 1, P2: 2, P3: 3 } as const;

const SECTION_DEFS = [
  { key: "top", title: "Top stories requiring attention" },
  { key: "edmonton_catholic", title: "Edmonton Catholic news" },
  { key: "partners", title: "Partner organization updates" },
  { key: "alberta", title: "Alberta education, healthcare & policy" },
  { key: "canadian_vatican", title: "Canadian Catholic & Vatican news" },
  { key: "events", title: "Upcoming events", note: "Event details as published by each source — confirm dates and times on the original page." },
] as const;

type SectionKey = (typeof SECTION_DEFS)[number]["key"];

type Row = Story & { publisher: string; orgType: string };

export function sectionFor(s: Pick<Row, "priority" | "category" | "geoRelevance" | "orgType">): SectionKey {
  if (s.priority === "P0" || s.priority === "P1") return "top";
  if (s.category === "event") return "events";
  if (s.category === "archdiocese" || s.orgType === "archdiocese") return "edmonton_catholic";
  if (s.orgType === "catholic_partner") return "partners";
  if (["vatican", "canadian_catholic"].includes(s.category) || ["vatican", "catholic_national"].includes(s.orgType)) return "canadian_vatican";
  if (s.geoRelevance === "edmonton" && s.orgType !== "government") return "edmonton_catholic";
  return "alberta";
}

const toEmailStory = (s: Row): EmailStory => ({
  id: s.id,
  title: s.title,
  url: s.canonicalUrl,
  description: s.description,
  publisher: s.publisher,
  publishedAt: s.publishedAt,
  firstDetectedAt: s.firstDetectedAt,
  priority: s.priority,
  sensitive: s.sensitive,
  verificationStatus: s.verificationStatus,
  priorityReason: s.priorityReason,
});

export type DigestBuild = {
  subject: string;
  html: string;
  text: string;
  storyIds: number[];
  windowStart: number;
  sections: DigestSection[];
  followUps: DigestFollowUp[];
};

/** Assemble (but do not store) the digest for `now`. */
export function buildDigest(db: DB = getDb(), now = Date.now()): DigestBuild {
  const settings = getSettings(db);
  const last = db
    .select({ createdAt: notifications.createdAt })
    .from(notifications)
    .where(and(eq(notifications.kind, "digest"), inArray(notifications.status, ["sent", "simulated"])))
    .orderBy(desc(notifications.createdAt))
    .get();
  const lookbackStart = now - settings.digestLookbackHours * 3600_000;
  const windowStart = Math.max(Math.min(last?.createdAt ?? lookbackStart, lookbackStart), now - MAX_WINDOW_HOURS * 3600_000);

  const alreadyDigested = db
    .select({ id: notificationStories.storyId })
    .from(notificationStories)
    .where(eq(notificationStories.kind, "digest"));

  // Effective time: publisher date if known; detection time only for non-baseline items.
  const effective = sql<number>`coalesce(${stories.publishedAt}, case when ${stories.alertSuppressed} = 0 then ${stories.firstDetectedAt} end)`;
  const rows = db
    .select({ s: stories, publisher: sources.name, orgType: sources.orgType })
    .from(stories)
    .innerJoin(sources, eq(sources.id, stories.sourceId))
    .where(
      and(
        ne(stories.reviewStatus, "archived"),
        notInArray(stories.id, alreadyDigested),
        sql`${effective} >= ${windowStart}`,
        sql`${stories.firstDetectedAt} <= ${now}`,
      ),
    )
    .all()
    .map((r): Row => ({ ...r.s, publisher: r.publisher, orgType: r.orgType }));

  rows.sort((a, b) => RANK[a.priority] - RANK[b.priority] || (b.publishedAt ?? b.firstDetectedAt) - (a.publishedAt ?? a.firstDetectedAt));

  const buckets = new Map<SectionKey, Row[]>(SECTION_DEFS.map((d) => [d.key, []]));
  for (const r of rows) buckets.get(sectionFor(r))!.push(r);

  const included: number[] = [];
  const sections: DigestSection[] = SECTION_DEFS.map((d) => {
    const all = buckets.get(d.key)!;
    const shown = all.slice(0, d.key === "top" ? 15 : MAX_PER_SECTION);
    // Every candidate counts as covered by this digest (shown or "+N more"), so it is never repeated.
    included.push(...all.map((s) => s.id));
    return { key: d.key, title: d.title, note: "note" in d ? d.note : undefined, stories: shown.map(toEmailStory), more: all.length - shown.length };
  });

  const fuRows = db
    .select({ title: stories.title, url: stories.canonicalUrl, assignee: users.name, assigneeEmail: users.email, dueAt: followUps.dueAt, status: stories.reviewStatus })
    .from(followUps)
    .innerJoin(stories, eq(stories.id, followUps.storyId))
    .leftJoin(users, eq(users.id, followUps.assigneeId))
    .where(and(isNull(followUps.completedAt), inArray(stories.reviewStatus, ["reviewing", "assigned"])))
    .orderBy(sql`coalesce(${followUps.dueAt}, 9e15)`)
    .limit(15)
    .all();
  const followUpsOut: DigestFollowUp[] = fuRows.map((f) => ({
    title: f.title,
    url: f.url,
    assignee: f.assignee || f.assigneeEmail || null,
    dueAt: f.dueAt,
    status: f.status === "assigned" ? "Assigned" : "Reviewing",
    overdue: f.dueAt != null && f.dueAt < now,
  }));

  const rendered = renderDigest({ now, sections, followUps: followUpsOut, windowStart, appUrl: env().APP_URL, totalStories: rows.length });
  return { ...rendered, storyIds: included, windowStart, sections, followUps: followUpsOut };
}

export type DigestRunResult =
  | { status: "disabled" | "not_due" | "already_done" }
  | { status: "missed"; dateKey: string }
  | { status: "created"; notificationId: number; dateKey: string; storyCount: number };

/**
 * Idempotent scheduled digest. Safe to call every minute from any number of processes: the unique
 * dedupe key `digest:<Edmonton date>` guarantees at most one digest per local day.
 */
export async function runScheduledDigest(db: DB = getDb(), now = Date.now()): Promise<DigestRunResult> {
  const settings = getSettings(db);
  if (!settings.digestEnabled) return { status: "disabled" };
  const dateKey = edmontonDateKey(now);
  const dedupeKey = `digest:${dateKey}`;
  const scheduled = scheduledInstantForDay(now, settings.digestTime);
  if (now < scheduled) return { status: "not_due" };
  if (db.select({ id: notifications.id }).from(notifications).where(eq(notifications.dedupeKey, dedupeKey)).get()) {
    return { status: "already_done" };
  }
  if (now > scheduled + CATCH_UP_HOURS * 3600_000) {
    // Fresh installation started after today's window: nothing was missed; the first brief goes out tomorrow.
    if (!db.select({ id: notifications.id }).from(notifications).where(eq(notifications.kind, "digest")).get()) return { status: "not_due" };
    // Worker was down through the whole window: record it visibly rather than sending a stale "morning" brief.
    db.insert(notifications)
      .values({
        kind: "digest",
        dedupeKey,
        recipient: settings.digestRecipient,
        subject: `Missed morning brief for ${dateKey}`,
        status: "skipped",
        lastError: `Worker was not running between ${settings.digestTime} and ${CATCH_UP_HOURS} h later (Edmonton time).`,
        createdAt: now,
      })
      .onConflictDoNothing()
      .run();
    return { status: "missed", dateKey };
  }
  const built = buildDigest(db, now);
  const id = db.transaction((tx) => {
    const row = tx
      .insert(notifications)
      .values({
        kind: "digest",
        dedupeKey,
        recipient: digestRecipients(db, settings.digestRecipient),
        subject: built.subject,
        html: built.html,
        text: built.text,
        status: "pending",
        meta: { dateKey, storyCount: built.storyIds.length, windowStart: built.windowStart },
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: notifications.id })
      .get();
    if (!row) return null;
    for (const storyId of built.storyIds) {
      tx.insert(notificationStories).values({ notificationId: row.id, storyId, kind: "digest" }).onConflictDoNothing().run();
    }
    return row.id;
  });
  if (!id) return { status: "already_done" };
  await deliverNotification(id, db, now);
  return { status: "created", notificationId: id, dateKey, storyCount: built.storyIds.length };
}

/**
 * Manual "send preview to outbox": stored as a test message addressed only to the requester; does not
 * consume stories from the real digest.
 */
export async function createDigestPreviewNotification(db: DB = getDb(), now = Date.now(), requestedBy?: string) {
  const settings = getSettings(db);
  const built = buildDigest(db, now);
  const row = db
    .insert(notifications)
    .values({
      kind: "test",
      dedupeKey: `digest-preview:${now}:${Math.random().toString(36).slice(2, 8)}`,
      recipient: requestedBy ?? settings.digestRecipient,
      subject: `[PREVIEW] ${built.subject}`,
      html: built.html,
      text: built.text,
      status: "pending",
      meta: { preview: true, requestedBy, storyCount: built.storyIds.length },
      createdAt: now,
    })
    .returning({ id: notifications.id })
    .get();
  await deliverNotification(row.id, db, now);
  return row.id;
}
