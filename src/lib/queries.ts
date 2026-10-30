import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { first, getDb } from "./db/client";
import {
  accessRequests,
  auditLogs,
  followUpNotes,
  followUps,
  notifications,
  notificationStories,
  PRIORITIES,
  REVIEW_STATUSES,
  sourceCheckLogs,
  sources,
  stories,
  storyPriorityHistory,
  storySources,
  users,
  type Priority,
  type ReviewStatus,
} from "./db/schema";
import { getTickState } from "./tick";
import { edmontonDayRange } from "./time";

export type StoryFilters = {
  q?: string;
  source?: string;
  priority?: string;
  status?: string;
  from?: string;
  to?: string;
  sort?: string;
  page?: number;
  review?: string;
};

export const PAGE_SIZE = 25;

const storyCols = {
  id: stories.id,
  title: stories.title,
  url: stories.canonicalUrl,
  description: stories.description,
  publishedAt: stories.publishedAt,
  firstDetectedAt: stories.firstDetectedAt,
  priority: stories.priority,
  priorityOverridden: stories.priorityOverridden,
  category: stories.category,
  reviewStatus: stories.reviewStatus,
  sensitive: stories.sensitive,
  verificationStatus: stories.verificationStatus,
  isSample: stories.isSample,
  sourceName: sources.name,
  sourceSlug: sources.slug,
};

export type StoryListItem = {
  id: number;
  title: string;
  url: string;
  description: string | null;
  publishedAt: number | null;
  firstDetectedAt: number;
  priority: Priority;
  priorityOverridden: boolean;
  category: string;
  reviewStatus: ReviewStatus;
  sensitive: boolean;
  verificationStatus: string;
  isSample: boolean;
  sourceName: string;
  sourceSlug: string;
};

const effectiveTime = sql`coalesce(${stories.publishedAt}, ${stories.firstDetectedAt})`;

export async function listStories(f: StoryFilters) {
  const db = getDb();
  const where: SQL[] = [];
  if (f.q?.trim()) {
    const term = `%${f.q.trim().replace(/[%_]/g, "\\$&")}%`;
    where.push(or(sql`${stories.title} ilike ${term} escape '\\'`, sql`${stories.description} ilike ${term} escape '\\'`)!);
  }
  if (f.source) where.push(eq(sources.slug, f.source));
  if (f.priority && (PRIORITIES as readonly string[]).includes(f.priority)) where.push(eq(stories.priority, f.priority as Priority));
  if (f.priority === "high") where.push(inArray(stories.priority, ["P0", "P1"]));
  if (f.status === "open") where.push(inArray(stories.reviewStatus, ["new", "reviewing", "assigned"]));
  else if (f.status && (REVIEW_STATUSES as readonly string[]).includes(f.status)) where.push(eq(stories.reviewStatus, f.status as ReviewStatus));
  else if (!f.status) where.push(ne(stories.reviewStatus, "archived"));
  if (f.review === "1") where.push(or(eq(stories.sensitive, true), eq(stories.verificationStatus, "unverified"))!);
  const from = f.from ? edmontonDayRange(f.from) : null;
  const to = f.to ? edmontonDayRange(f.to) : null;
  if (from) where.push(sql`${effectiveTime} >= ${from.start}`);
  if (to) where.push(sql`${effectiveTime} < ${to.end}`);

  const order =
    f.sort === "oldest"
      ? [asc(effectiveTime)]
      : f.sort === "priority"
        ? [asc(stories.priority), desc(effectiveTime)]
        : f.sort === "detected"
          ? [desc(stories.firstDetectedAt)]
          : [desc(effectiveTime)];

  const page = Math.max(1, f.page ?? 1);
  const cond = where.length ? and(...where) : undefined;
  const total = (await first(
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(stories)
      .innerJoin(sources, eq(sources.id, stories.sourceId))
      .where(cond),
  ))!.n;
  const items = (await db
    .select(storyCols)
    .from(stories)
    .innerJoin(sources, eq(sources.id, stories.sourceId))
    .where(cond)
    .orderBy(...order)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)) as StoryListItem[];
  return { items, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getStoryDetail(id: number) {
  const db = getDb();
  const story = await first(
    db
      .select({ s: stories, sourceName: sources.name, sourceSlug: sources.slug, sourceWebsite: sources.websiteUrl, orgType: sources.orgType })
      .from(stories)
      .innerJoin(sources, eq(sources.id, stories.sourceId))
      .where(eq(stories.id, id)),
  );
  if (!story) return null;
  const reportedBy = await db
    .select({ name: sources.name, url: storySources.url, detectedAt: storySources.detectedAt })
    .from(storySources)
    .innerJoin(sources, eq(sources.id, storySources.sourceId))
    .where(eq(storySources.storyId, id));
  const related = (await db
    .select(storyCols)
    .from(stories)
    .innerJoin(sources, eq(sources.id, stories.sourceId))
    .where(and(eq(stories.groupKey, story.s.groupKey), ne(stories.id, id)))
    .orderBy(desc(effectiveTime))
    .limit(10)) as StoryListItem[];
  const history = await db
    .select({ h: storyPriorityHistory, by: users.name, byEmail: users.email })
    .from(storyPriorityHistory)
    .leftJoin(users, eq(users.id, storyPriorityHistory.changedBy))
    .where(eq(storyPriorityHistory.storyId, id))
    .orderBy(desc(storyPriorityHistory.changedAt), desc(storyPriorityHistory.id));
  const followUp = await first(
    db
      .select({ f: followUps, assignee: users.name, assigneeEmail: users.email })
      .from(followUps)
      .leftJoin(users, eq(users.id, followUps.assigneeId))
      .where(eq(followUps.storyId, id)),
  );
  const notes = followUp
    ? await db
        .select({ n: followUpNotes, author: users.name, authorEmail: users.email })
        .from(followUpNotes)
        .leftJoin(users, eq(users.id, followUpNotes.authorId))
        .where(eq(followUpNotes.followUpId, followUp.f.id))
        .orderBy(desc(followUpNotes.createdAt), desc(followUpNotes.id))
    : [];
  const activity = await db
    .select({ a: auditLogs, by: users.name, byEmail: users.email })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(and(eq(auditLogs.entityType, "story"), eq(auditLogs.entityId, String(id))))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(30);
  const sentIn = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      subject: notifications.subject,
      status: notifications.status,
      createdAt: notifications.createdAt,
    })
    .from(notificationStories)
    .innerJoin(notifications, eq(notifications.id, notificationStories.notificationId))
    .where(eq(notificationStories.storyId, id));
  return { ...story, reportedBy, related, history, followUp, notes, activity, sentIn };
}

export async function listActiveStaff() {
  return await getDb()
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.status, "active"))
    .orderBy(asc(users.name));
}

export async function listSourceOptions() {
  return await getDb().select({ slug: sources.slug, name: sources.name }).from(sources).orderBy(asc(sources.name));
}

export async function listFollowUps(f: { view?: string; assignee?: number }) {
  const db = getDb();
  const statuses: ReviewStatus[] = f.view === "covered" ? ["covered"] : f.view === "archived" ? ["archived"] : ["new", "reviewing", "assigned"];
  const where: SQL[] = [inArray(stories.reviewStatus, statuses)];
  if (f.assignee) where.push(eq(followUps.assigneeId, f.assignee));
  const lastNote = sql<
    string | null
  >`(select body from follow_up_notes n where n.follow_up_id = ${followUps.id} order by n.created_at desc, n.id desc limit 1)`;
  const noteCount = sql<number>`(select count(*) from follow_up_notes n where n.follow_up_id = ${followUps.id})`;
  return await db
    .select({
      followUpId: followUps.id,
      storyId: stories.id,
      title: stories.title,
      url: stories.canonicalUrl,
      priority: stories.priority,
      reviewStatus: stories.reviewStatus,
      sensitive: stories.sensitive,
      sourceName: sources.name,
      assigneeId: followUps.assigneeId,
      assignee: users.name,
      assigneeEmail: users.email,
      dueAt: followUps.dueAt,
      completedAt: followUps.completedAt,
      updatedAt: followUps.updatedAt,
      lastNote,
      noteCount,
    })
    .from(followUps)
    .innerJoin(stories, eq(stories.id, followUps.storyId))
    .innerJoin(sources, eq(sources.id, stories.sourceId))
    .leftJoin(users, eq(users.id, followUps.assigneeId))
    .where(and(...where))
    .orderBy(asc(stories.priority), sql`coalesce(${followUps.dueAt}, 9e15)`);
}

export async function listSources() {
  const db = getDb();
  const all = await db
    .select()
    .from(sources)
    .where(ne(sources.slug, "sample"))
    .orderBy(desc(sources.verified), desc(sources.enabled), asc(sources.name));
  const perSource = await db
    .select({ sourceId: stories.sourceId, n: sql<number>`count(*)`.mapWith(Number) })
    .from(stories)
    .groupBy(stories.sourceId);
  const counts = new Map(perSource.map((r) => [r.sourceId, r.n]));
  return all.map((s) => ({ ...s, storyCount: counts.get(s.id) ?? 0 }));
}

export async function recentCheckLogs(limit = 25) {
  return await getDb()
    .select({ l: sourceCheckLogs, name: sources.name })
    .from(sourceCheckLogs)
    .innerJoin(sources, eq(sources.id, sourceCheckLogs.sourceId))
    .orderBy(desc(sourceCheckLogs.startedAt), desc(sourceCheckLogs.id))
    .limit(limit);
}

export async function listNotifications(kind?: string, limit = 100) {
  const db = getDb();
  const cols = {
    id: notifications.id,
    kind: notifications.kind,
    subject: notifications.subject,
    recipient: notifications.recipient,
    status: notifications.status,
    transport: notifications.transport,
    attempts: notifications.attempts,
    lastError: notifications.lastError,
    createdAt: notifications.createdAt,
    sentAt: notifications.sentAt,
    nextAttemptAt: notifications.nextAttemptAt,
  };
  return await db
    .select(cols)
    .from(notifications)
    .where(kind ? eq(notifications.kind, kind as "digest") : undefined)
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);
}

export async function getNotification(id: number) {
  const db = getDb();
  const n = await first(db.select().from(notifications).where(eq(notifications.id, id)));
  if (!n) return null;
  const linked = await db
    .select({ id: stories.id, title: stories.title, priority: stories.priority })
    .from(notificationStories)
    .innerJoin(stories, eq(stories.id, notificationStories.storyId))
    .where(eq(notificationStories.notificationId, id));
  return { ...n, linked };
}

export async function listStaff() {
  return await getDb().select().from(users).orderBy(asc(users.status), asc(users.email));
}

export async function recentAudit(limit = 40) {
  return await getDb()
    .select({ a: auditLogs, by: users.name, byEmail: users.email })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(limit);
}

/** `email` scopes the latest brief and alert to what the signed-in person received. */
export async function getOverview(email: string, now = Date.now()) {
  const db = getDb();
  const day = now - 24 * 3600_000;
  const count = async (cond: SQL | undefined) =>
    (await first(
      db
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(stories)
        .where(cond),
    ))!.n;
  const newStories = await count(and(gte(stories.firstDetectedAt, day), eq(stories.alertSuppressed, false)));
  const newTotal24h = await count(gte(stories.firstDetectedAt, day));
  const highOpen = await count(and(inArray(stories.priority, ["P0", "P1"]), inArray(stories.reviewStatus, ["new", "reviewing", "assigned"])));
  const needsReview = await count(
    and(eq(stories.reviewStatus, "new"), or(eq(stories.sensitive, true), eq(stories.verificationStatus, "unverified"))),
  );
  const unreviewed = await count(eq(stories.reviewStatus, "new"));
  const openFollowUps = (await first(
    db
      .select({
        n: sql<number>`count(*)`.mapWith(Number),
        overdue: sql<number>`sum(case when ${followUps.dueAt} < ${now} then 1 else 0 end)`.mapWith(Number),
      })
      .from(followUps)
      .innerJoin(stories, eq(stories.id, followUps.storyId))
      .where(and(isNull(followUps.completedAt), inArray(stories.reviewStatus, ["reviewing", "assigned"]))),
  ))!;
  const highPriority = (await db
    .select(storyCols)
    .from(stories)
    .innerJoin(sources, eq(sources.id, stories.sourceId))
    .where(and(inArray(stories.priority, ["P0", "P1"]), inArray(stories.reviewStatus, ["new", "reviewing", "assigned"])))
    .orderBy(asc(stories.priority), desc(effectiveTime))
    .limit(6)) as StoryListItem[];
  const recent = (await db
    .select(storyCols)
    .from(stories)
    .innerJoin(sources, eq(sources.id, stories.sourceId))
    .where(and(inArray(stories.priority, ["P0", "P1", "P2"]), ne(stories.reviewStatus, "archived"), gte(effectiveTime, now - 72 * 3600_000)))
    .orderBy(desc(effectiveTime))
    .limit(8)) as StoryListItem[];
  const srcs = await db
    .select()
    .from(sources)
    .where(and(eq(sources.verified, true), inArray(sources.method, ["rss", "html"])));
  const lastDigest = await first(
    db
      .select()
      .from(notifications)
      .where(and(eq(notifications.kind, "brief"), eq(notifications.recipient, email)))
      .orderBy(desc(notifications.createdAt)),
  );
  const lastAlert = await first(
    db
      .select({ createdAt: notifications.createdAt, status: notifications.status, subject: notifications.subject })
      .from(notifications)
      .where(and(eq(notifications.kind, "alert"), sql`${email} = any(string_to_array(replace(${notifications.recipient}, ' ', ''), ','))`))
      .orderBy(desc(notifications.createdAt)),
  );
  const failedDeliveries = (await first(
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(notifications)
      .where(and(eq(notifications.status, "failed"), gte(notifications.createdAt, now - 7 * 24 * 3600_000))),
  ))!.n;
  const tick = await getTickState(db);
  return {
    newStories,
    newTotal24h,
    highOpen,
    needsReview,
    unreviewed,
    openFollowUps: openFollowUps.n,
    overdueFollowUps: openFollowUps.overdue ?? 0,
    highPriority,
    recent,
    sources: srcs,
    lastDigest,
    lastAlert,
    failedDeliveries,
    tick,
  };
}

export async function shellCounts() {
  const db = getDb();
  const followUpsOpen = (await first(
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(followUps)
      .innerJoin(stories, eq(stories.id, followUps.storyId))
      .where(and(isNull(followUps.completedAt), inArray(stories.reviewStatus, ["reviewing", "assigned"]))),
  ))!.n;
  const outboxFailed = (await first(
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(notifications)
      .where(and(eq(notifications.status, "failed"), gte(notifications.createdAt, Date.now() - 7 * 24 * 3600_000))),
  ))!.n;
  const accessRequestsPending = (await first(
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(accessRequests)
      .where(eq(accessRequests.status, "pending")),
  ))!.n;
  return { followUps: followUpsOpen, outboxFailed, accessRequests: accessRequestsPending };
}

/** Highest story id, so the browser can ask the live endpoint what arrived after the page loaded. */
export async function latestStoryId() {
  const row = await first(getDb().select({ id: stories.id }).from(stories).orderBy(desc(stories.id)).limit(1));
  return row?.id ?? 0;
}
