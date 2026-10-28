import { and, eq, gte, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { first, getDb, type DB } from "../db/client";
import { notifications, notificationStories, sources, stories } from "../db/schema";
import { env } from "../env";
import { getSettings } from "../settings";
import { isWithinLocalWindow } from "../time";
import { deliverNotification } from "./deliver";
import { alertRecipients } from "./recipients";
import { renderAlert, type EmailStory } from "./templates/emails";

const DETECTION_WINDOW_H = 6;
const PUBLICATION_WINDOW_H = 72;
const MAX_STORIES_PER_ALERT = 10;

export type AlertCandidate = EmailStory & { held?: string };

export type AlertEvaluation = {
  enabled: boolean;
  inWindow: boolean;
  sentLastHour: number;
  sentLastDay: number;
  eligible: AlertCandidate[];
  held: AlertCandidate[];
  blockedReason: string | null;
};

/** Which stories would be alerted right now, and why others are held. Pure read. */
export async function evaluateAlerts(db: DB = getDb(), now = Date.now()): Promise<AlertEvaluation> {
  const s = await getSettings(db);
  const allowed = s.alertMinPriority === "P0" ? (["P0"] as const) : (["P0", "P1"] as const);
  const alerted = db.select({ id: notificationStories.storyId }).from(notificationStories).where(eq(notificationStories.kind, "alert"));
  const rows = await db
    .select({ s: stories, publisher: sources.name })
    .from(stories)
    .innerJoin(sources, eq(sources.id, stories.sourceId))
    .where(
      and(
        inArray(stories.priority, [...allowed]),
        ne(stories.reviewStatus, "archived"),
        notInArray(stories.id, alerted),
        or(
          // Human override to P0/P1 makes a story eligible regardless of age/baseline.
          eq(stories.priorityOverridden, true),
          and(
            eq(stories.alertSuppressed, false),
            gte(stories.firstDetectedAt, now - DETECTION_WINDOW_H * 3600_000),
            or(isNull(stories.publishedAt), gte(stories.publishedAt, now - PUBLICATION_WINDOW_H * 3600_000)),
          ),
        ),
      ),
    )
    .orderBy(stories.priority, sql`${stories.firstDetectedAt} desc`);

  const candidates: AlertCandidate[] = rows.map(({ s: r, publisher }) => ({
    id: r.id,
    title: r.title,
    url: r.canonicalUrl,
    description: r.description,
    publisher,
    publishedAt: r.publishedAt,
    firstDetectedAt: r.firstDetectedAt,
    priority: r.priority,
    sensitive: r.sensitive,
    verificationStatus: r.verificationStatus,
    priorityReason: r.priorityReason,
  }));

  const countSince = async (since: number) =>
    (await first(
      db
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(notifications)
        .where(
          and(
            eq(notifications.kind, "alert"),
            inArray(notifications.status, ["sent", "simulated", "pending", "failed"]),
            gte(notifications.createdAt, since),
          ),
        ),
    ))!.n;
  const sentLastHour = await countSince(now - 3600_000);
  const sentLastDay = await countSince(now - 24 * 3600_000);
  const inWindow = isWithinLocalWindow(now, s.alertWindowStart, s.alertWindowEnd);

  const eligible: AlertCandidate[] = [];
  const held: AlertCandidate[] = [];
  for (const c of candidates) {
    if (!inWindow && !(c.priority === "P0" && s.alertP0BypassWindow)) {
      held.push({ ...c, held: `Outside alert hours (${s.alertWindowStart}–${s.alertWindowEnd})` });
    } else eligible.push(c);
  }
  let blockedReason: string | null = null;
  if (!s.alertsEnabled) blockedReason = "Alerts are disabled in Settings";
  else if (eligible.length && sentLastHour >= s.alertMaxPerHour) blockedReason = `Hourly alert limit reached (${s.alertMaxPerHour})`;
  else if (eligible.length && sentLastDay >= s.alertMaxPerDay) blockedReason = `Daily alert limit reached (${s.alertMaxPerDay})`;
  return { enabled: s.alertsEnabled, inWindow, sentLastHour, sentLastDay, eligible, held, blockedReason };
}

export type AlertRunResult =
  | { status: "none" | "disabled" }
  | { status: "rate_limited"; skippedStoryIds: number[]; reason: string }
  | { status: "created"; notificationId: number; storyIds: number[] };

/**
 * Send one batched alert for all currently eligible stories. Each story is alerted at most once
 * (notification_stories), and a deterministic dedupe key prevents duplicate sends after restarts.
 */
export async function processAlerts(db: DB = getDb(), now = Date.now()): Promise<AlertRunResult> {
  const ev = await evaluateAlerts(db, now);
  if (!ev.enabled) return { status: "disabled" };
  if (!ev.eligible.length) return { status: "none" };
  const s = await getSettings(db);
  const batch = ev.eligible.slice(0, MAX_STORIES_PER_ALERT);
  const ids = batch.map((b) => b.id).sort((a, b) => a - b);
  const recipient = await alertRecipients(
    db,
    s.alertRecipient,
    batch.some((b) => b.priority === "P0"),
  );

  if (ev.blockedReason) {
    // Flood control: record the skip so the history explains it; the stories remain in the dashboard/digest.
    await db.transaction(async (tx) => {
      const row = (
        await tx
          .insert(notifications)
          .values({
            kind: "alert",
            dedupeKey: `alert-skipped:${ids.join(",")}`,
            recipient,
            subject: `Alert suppressed: ${batch.length} high-priority ${batch.length === 1 ? "story" : "stories"}`,
            status: "skipped",
            lastError: `${ev.blockedReason}. Stories will appear in the next morning brief.`,
            meta: { storyIds: ids },
            createdAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: notifications.id })
      )[0];
      if (row)
        for (const id of ids)
          await tx.insert(notificationStories).values({ notificationId: row.id, storyId: id, kind: "alert" }).onConflictDoNothing();
    });
    return { status: "rate_limited", skippedStoryIds: ids, reason: ev.blockedReason };
  }

  const rendered = renderAlert({ now, stories: batch, appUrl: env().APP_URL });
  const id = await db.transaction(async (tx) => {
    const row = (
      await tx
        .insert(notifications)
        .values({
          kind: "alert",
          dedupeKey: `alert:${ids.join(",")}`,
          recipient,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          status: "pending",
          meta: { storyIds: ids, sensitive: batch.some((b) => b.sensitive) },
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: notifications.id })
    )[0];
    if (!row) return null;
    for (const storyId of ids) await tx.insert(notificationStories).values({ notificationId: row.id, storyId, kind: "alert" }).onConflictDoNothing();
    return row.id;
  });
  if (!id) return { status: "none" };
  await deliverNotification(id, db, now);
  return { status: "created", notificationId: id, storyIds: ids };
}
