import { and, eq } from "drizzle-orm";
import { audit } from "./audit";
import { first, getDb, type DB } from "./db/client";
import { followUpNotes, followUps, sources, stories, storyPriorityHistory, users, type Priority, type ReviewStatus } from "./db/schema";
import { profileOf } from "./ingest/collector";
import { classifyStory } from "./priority/classify";
import { getSettings } from "./settings";

/** Workflow: New → Reviewing → Assigned → Covered / Archived (with reopen paths). */
export const TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  new: ["reviewing", "assigned", "covered", "archived"],
  reviewing: ["new", "assigned", "covered", "archived"],
  assigned: ["reviewing", "covered", "archived"],
  covered: ["reviewing", "archived"],
  archived: ["new", "reviewing"],
};

async function getStory(db: DB, id: number) {
  const s = await first(db.select().from(stories).where(eq(stories.id, id)));
  if (!s) throw new Error("Story not found");
  return s;
}

export async function setReviewStatus(storyId: number, to: ReviewStatus, userId: number, db: DB = getDb(), now = Date.now()) {
  const s = await getStory(db, storyId);
  if (s.reviewStatus === to) return s;
  if (!TRANSITIONS[s.reviewStatus].includes(to)) {
    throw new Error(`Cannot move a story from ${s.reviewStatus} to ${to}.`);
  }
  if (to === "assigned" && !(await first(db.select().from(followUps).where(eq(followUps.storyId, storyId))))) {
    throw new Error("Assign the follow-up to someone first.");
  }
  await db.transaction(async (tx) => {
    await tx.update(stories).set({ reviewStatus: to, updatedAt: now }).where(eq(stories.id, storyId));
    const fu = await first(tx.select().from(followUps).where(eq(followUps.storyId, storyId)));
    if (fu) {
      const done = to === "covered" || to === "archived";
      await tx
        .update(followUps)
        .set({ completedAt: done ? (fu.completedAt ?? now) : null, updatedAt: now })
        .where(eq(followUps.id, fu.id));
    }
  });
  await audit("story.status_changed", "story", storyId, userId, { from: s.reviewStatus, to }, db);
  return getStory(db, storyId);
}

export async function overridePriority(storyId: number, to: Priority, reason: string, userId: number, db: DB = getDb(), now = Date.now()) {
  const s = await getStory(db, storyId);
  const why = reason.trim();
  if (!why) throw new Error("Please give a reason for the priority change.");
  await db.transaction(async (tx) => {
    await tx.update(stories).set({ priority: to, priorityOverridden: true, updatedAt: now }).where(eq(stories.id, storyId));
    await tx
      .insert(storyPriorityHistory)
      .values({ storyId, fromPriority: s.priority, toPriority: to, reason: `Manual override: ${why}`, changedBy: userId, changedAt: now });
  });
  await audit("story.priority_overridden", "story", storyId, userId, { from: s.priority, to, reason: why }, db);
}

/** Remove a manual override and re-run the classifier for one story. */
export async function resetPriority(storyId: number, userId: number, db: DB = getDb(), now = Date.now()) {
  const s = await getStory(db, storyId);
  const src = (await first(db.select().from(sources).where(eq(sources.id, s.sourceId))))!;
  const c = classifyStory(
    { title: s.title, description: s.description, publishedAt: s.publishedAt ?? s.firstDetectedAt, source: profileOf(src) },
    (await getSettings(db)).priorityRules,
    now,
  );
  await db.transaction(async (tx) => {
    await tx
      .update(stories)
      .set({
        priority: c.priority,
        priorityScore: c.score,
        priorityReason: c.reason,
        priorityOverridden: false,
        category: c.category,
        geoRelevance: c.geoRelevance,
        sensitive: c.sensitive,
        updatedAt: now,
      })
      .where(eq(stories.id, storyId));
    await tx
      .insert(storyPriorityHistory)
      .values({
        storyId,
        fromPriority: s.priority,
        toPriority: c.priority,
        reason: "Override removed; automatic classification restored",
        changedBy: userId,
        changedAt: now,
      });
  });
  await audit("story.priority_reset", "story", storyId, userId, { from: s.priority, to: c.priority }, db);
}

export async function markVerified(storyId: number, userId: number, db: DB = getDb()) {
  await db.update(stories).set({ verificationStatus: "verified_by_staff", updatedAt: Date.now() }).where(eq(stories.id, storyId));
  await audit("story.verified", "story", storyId, userId, undefined, db);
}

export async function assignFollowUp(
  storyId: number,
  input: { assigneeId: number | null; dueAt: number | null; note?: string },
  userId: number,
  db: DB = getDb(),
  now = Date.now(),
) {
  const s = await getStory(db, storyId);
  if (input.assigneeId) {
    const a = await first(
      db
        .select()
        .from(users)
        .where(and(eq(users.id, input.assigneeId), eq(users.status, "active"))),
    );
    if (!a) throw new Error("Assignee must be an active staff member.");
  }
  const id = await db.transaction(async (tx) => {
    const existing = await first(tx.select().from(followUps).where(eq(followUps.storyId, storyId)));
    let fuId: number;
    if (existing) {
      await tx
        .update(followUps)
        .set({ assigneeId: input.assigneeId, dueAt: input.dueAt, completedAt: null, updatedAt: now })
        .where(eq(followUps.id, existing.id));
      fuId = existing.id;
    } else {
      const [row] = await tx
        .insert(followUps)
        .values({ storyId, assigneeId: input.assigneeId, dueAt: input.dueAt, createdBy: userId, createdAt: now, updatedAt: now })
        .returning({ id: followUps.id });
      fuId = row.id;
    }
    if (input.note?.trim())
      await tx.insert(followUpNotes).values({ followUpId: fuId, authorId: userId, body: input.note.trim().slice(0, 4000), createdAt: now });
    await tx.update(stories).set({ reviewStatus: "assigned", updatedAt: now }).where(eq(stories.id, storyId));
    return fuId;
  });
  await audit("follow_up.assigned", "story", storyId, userId, { assigneeId: input.assigneeId, dueAt: input.dueAt, from: s.reviewStatus }, db);
  return id;
}

export async function addFollowUpNote(storyId: number, body: string, userId: number, db: DB = getDb(), now = Date.now()) {
  const text = body.trim();
  if (!text) throw new Error("Note cannot be empty.");
  let fu = await first(db.select().from(followUps).where(eq(followUps.storyId, storyId)));
  if (!fu) {
    await getStory(db, storyId);
    [fu] = await db.insert(followUps).values({ storyId, createdBy: userId, createdAt: now, updatedAt: now }).returning();
  }
  await db.insert(followUpNotes).values({ followUpId: fu.id, authorId: userId, body: text.slice(0, 4000), createdAt: now });
  await db.update(followUps).set({ updatedAt: now }).where(eq(followUps.id, fu.id));
  await audit("follow_up.note_added", "story", storyId, userId, undefined, db);
}
