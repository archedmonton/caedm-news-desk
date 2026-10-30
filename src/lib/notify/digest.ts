import { and, desc, eq, inArray, isNull, like, ne, notInArray, sql, type SQL } from "drizzle-orm";
import { first, getDb, type DB } from "../db/client";
import { followUps, notifications, notificationStories, sources, stories, users, type Story, type User } from "../db/schema";
import { env } from "../env";
import { getSettings } from "../settings";
import { edmontonDateKey, formatTime, scheduledInstantForDay, zonedParts } from "../time";
import { briefScheduleLabel } from "./brief-schedule";
import { deliverNotification } from "./deliver";
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

/** Source types counted as Catholic news for personal briefs set to "Catholic news only". */
export const CATHOLIC_ORG_TYPES = ["archdiocese", "catholic_partner", "catholic_national", "vatican"];

export type BriefScope = "catholic" | "all";

/** A personal brief: news for one person, at their time and in their scope. */
type BriefFor = { user: Pick<User, "id" | "name" | "email">; scope: BriefScope; scheduleLabel: string };

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

/** Covers at least the lookback period, reaches back to the previous brief, and never more than 72 h. */
async function windowSince(db: DB, now: number, previous: SQL) {
  const settings = await getSettings(db);
  const last = await first(
    db
      .select({ createdAt: notifications.createdAt })
      .from(notifications)
      .where(and(previous, inArray(notifications.status, ["sent", "simulated"])))
      .orderBy(desc(notifications.createdAt)),
  );
  const lookbackStart = now - settings.digestLookbackHours * 3600_000;
  return Math.max(Math.min(last?.createdAt ?? lookbackStart, lookbackStart), now - MAX_WINDOW_HOURS * 3600_000);
}

/**
 * Assemble (but do not store) a brief for `now`. A personal brief covers everything in its own window, filtered to
 * the person's chosen scope. Without `personal` (the `digest:preview` CLI) it skips stories earlier team briefs covered.
 */
export async function buildDigest(
  db: DB = getDb(),
  now = Date.now(),
  opts: { personal?: BriefFor; windowStart?: number } = {},
): Promise<DigestBuild> {
  const personal = opts.personal;
  const windowStart = opts.windowStart ?? (await windowSince(db, now, eq(notifications.kind, "digest")));

  const alreadyDigested = db.select({ id: notificationStories.storyId }).from(notificationStories).where(eq(notificationStories.kind, "digest"));

  // Effective time: publisher date if known; detection time only for non-baseline items.
  const effective = sql<number>`coalesce(${stories.publishedAt}, case when ${stories.alertSuppressed} = false then ${stories.firstDetectedAt} end)`;
  const found = await db
    .select({ s: stories, publisher: sources.name, orgType: sources.orgType })
    .from(stories)
    .innerJoin(sources, eq(sources.id, stories.sourceId))
    .where(
      and(
        ne(stories.reviewStatus, "archived"),
        personal ? undefined : notInArray(stories.id, alreadyDigested),
        personal?.scope === "catholic" ? inArray(sources.orgType, CATHOLIC_ORG_TYPES) : undefined,
        sql`${effective} >= ${windowStart}`,
        sql`${stories.firstDetectedAt} <= ${now}`,
      ),
    );
  const rows = found.map((r): Row => ({ ...r.s, publisher: r.publisher, orgType: r.orgType }));

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

  const fuRows = await db
    .select({
      title: stories.title,
      url: stories.canonicalUrl,
      assignee: users.name,
      assigneeEmail: users.email,
      dueAt: followUps.dueAt,
      status: stories.reviewStatus,
    })
    .from(followUps)
    .innerJoin(stories, eq(stories.id, followUps.storyId))
    .leftJoin(users, eq(users.id, followUps.assigneeId))
    .where(
      and(
        isNull(followUps.completedAt),
        inArray(stories.reviewStatus, ["reviewing", "assigned"]),
        personal ? eq(followUps.assigneeId, personal.user.id) : undefined,
      ),
    )
    .orderBy(sql`coalesce(${followUps.dueAt}, 9e15)`)
    .limit(15);
  const followUpsOut: DigestFollowUp[] = fuRows.map((f) => ({
    title: f.title,
    url: f.url,
    assignee: f.assignee || f.assigneeEmail || null,
    dueAt: f.dueAt,
    status: f.status === "assigned" ? "Assigned" : "Reviewing",
    overdue: f.dueAt != null && f.dueAt < now,
  }));

  const rendered = renderDigest({
    now,
    sections,
    followUps: followUpsOut,
    windowStart,
    appUrl: env().APP_URL,
    totalStories: rows.length,
    personal: personal && { name: personal.user.name || personal.user.email, scope: personal.scope, scheduleLabel: personal.scheduleLabel },
  });
  return { ...rendered, storyIds: included, windowStart, sections, followUps: followUpsOut };
}

const SCOPE_LABEL: Record<BriefScope, string> = { catholic: "Catholic news only", all: "all monitored news" };

const briefColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  digestTime: users.digestTime,
  digestDays: users.digestDays,
  digestScope: users.digestScope,
};
type BriefUser = Pick<User, keyof typeof briefColumns>;

function isWeekend(now: number) {
  const p = zonedParts(now);
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return day === 0 || day === 6;
}

async function storePersonalBrief(db: DB, u: BriefUser, built: DigestBuild, dedupeKey: string, now: number, meta: Record<string, unknown>) {
  const row = (
    await db
      .insert(notifications)
      .values({
        kind: "brief",
        dedupeKey,
        recipient: u.email,
        subject: built.subject,
        html: built.html,
        text: built.text,
        status: "pending",
        meta: { userId: u.id, storyCount: built.storyIds.length, windowStart: built.windowStart, scope: u.digestScope, ...meta },
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: notifications.id })
  )[0];
  if (!row) return null;
  const delivered = await deliverNotification(row.id, db, now);
  return { id: row.id, status: delivered?.status ?? "pending", error: delivered?.lastError ?? null };
}

export type PersonalBriefRun = { sent: number; empty: number };

/**
 * Personal briefs for everyone who turned them on, each at their own Edmonton time. Idempotent per person per
 * day (`brief:<user>:<date>`). A day with nothing new in the person's scope is recorded as skipped, not emailed,
 * and a brief whose time passed more than 4 h before the next refresh is not sent late.
 */
export async function runPersonalBriefs(db: DB = getDb(), now = Date.now()): Promise<PersonalBriefRun> {
  const settings = await getSettings(db);
  const out: PersonalBriefRun = { sent: 0, empty: 0 };
  if (!settings.digestEnabled) return out;
  const people = await db
    .select(briefColumns)
    .from(users)
    .where(and(eq(users.status, "active"), eq(users.notifyDigest, true)));
  const dateKey = edmontonDateKey(now);
  const weekend = isWeekend(now);
  for (const u of people) {
    if (u.digestDays === "weekdays" && weekend) continue;
    const scheduled = scheduledInstantForDay(now, u.digestTime ?? settings.digestTime);
    if (now < scheduled || now > scheduled + CATCH_UP_HOURS * 3600_000) continue;
    const dedupeKey = `brief:${u.id}:${dateKey}`;
    if (await first(db.select({ id: notifications.id }).from(notifications).where(eq(notifications.dedupeKey, dedupeKey)))) continue;
    const windowStart = await windowSince(db, now, like(notifications.dedupeKey, `brief:${u.id}:%`));
    const personal = { user: u, scope: u.digestScope, scheduleLabel: briefScheduleLabel(u, settings.digestTime) };
    const built = await buildDigest(db, now, { personal, windowStart });
    if (built.storyIds.length === 0 && built.followUps.length === 0) {
      await db
        .insert(notifications)
        .values({
          kind: "brief",
          dedupeKey,
          recipient: u.email,
          subject: `Personal brief for ${u.name || u.email}: nothing new`,
          status: "skipped",
          lastError: `No new stories (${SCOPE_LABEL[u.digestScope]}) since ${formatTime(windowStart)}, so no email was sent.`,
          meta: { userId: u.id, storyCount: 0, windowStart },
          createdAt: now,
        })
        .onConflictDoNothing();
      out.empty++;
      continue;
    }
    if (await storePersonalBrief(db, u, built, dedupeKey, now, { dateKey })) out.sent++;
  }
  return out;
}

/** "Send me a brief now": the last lookback period, emailed immediately. Doesn't move the scheduled brief's window. */
export async function sendBriefNow(userId: number, db: DB = getDb(), now = Date.now()) {
  const settings = await getSettings(db);
  const u = await first(
    db
      .select(briefColumns)
      .from(users)
      .where(and(eq(users.id, userId), eq(users.status, "active"))),
  );
  if (!u) throw new Error("Your account is not active.");
  const windowStart = now - settings.digestLookbackHours * 3600_000;
  const built = await buildDigest(db, now, { personal: { user: u, scope: u.digestScope, scheduleLabel: "Sent on request" }, windowStart });
  // One per person per minute, so a double click can't send twice.
  const stored = await storePersonalBrief(db, u, built, `brief-now:${u.id}:${Math.floor(now / 60_000)}`, now, { onDemand: true });
  if (!stored) throw new Error("A brief was just sent to you. Please wait a minute before sending another.");
  return { notificationId: stored.id, status: stored.status, error: stored.error, storyCount: built.storyIds.length, recipient: u.email };
}
