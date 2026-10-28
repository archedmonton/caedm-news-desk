import { and, eq } from "drizzle-orm";
import { audit } from "./audit";
import { getDb, type DB } from "./db/client";
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

function getStory(db: DB, id: number) {
  const s = db.select().from(stories).where(eq(stories.id, id)).get();
  if (!s) throw new Error("Story not found");
  return s;
}

export function setReviewStatus(storyId: number, to: ReviewStatus, userId: number, db: DB = getDb(), now = Date.now()) {
  const s = getStory(db, storyId);
  if (s.reviewStatus === to) return s;
  if (!TRANSITIONS[s.reviewStatus].includes(to)) {
    throw new Error(`Cannot move a story from ${s.reviewStatus} to ${to}.`);
  }
  if (to === "assigned" && !db.select().from(followUps).where(eq(followUps.storyId, storyId)).get()) {
    throw new Error("Assign the follow-up to someone first.");
  }
  db.transaction((tx) => {
    tx.update(stories).set({ reviewStatus: to, updatedAt: now }).where(eq(stories.id, storyId)).run();
    const fu = tx.select().from(followUps).where(eq(followUps.storyId, storyId)).get();
    if (fu) {
      const done = to === "covered" || to === "archived";
      tx.update(followUps).set({ completedAt: done ? (fu.completedAt ?? now) : null, updatedAt: now }).where(eq(followUps.id, fu.id)).run();
    }
  });
  audit("story.status_changed", "story", storyId, userId, { from: s.reviewStatus, to }, db);
  return getStory(db, storyId);
}

export function overridePriority(storyId: number, to: Priority, reason: string, userId: number, db: DB = getDb(), now = Date.now()) {
  const s = getStory(db, storyId);
  const why = reason.trim();
  if (!why) throw new Error("Please give a reason for the priority change.");
  db.transaction((tx) => {
    tx.update(stories).set({ priority: to, priorityOverridden: true, updatedAt: now }).where(eq(stories.id, storyId)).run();
    tx.insert(storyPriorityHistory).values({ storyId, fromPriority: s.priority, toPriority: to, reason: `Manual override: ${why}`, changedBy: userId, changedAt: now }).run();
  });
  audit("story.priority_overridden", "story", storyId, userId, { from: s.priority, to, reason: why }, db);
}

/** Remove a manual override and re-run the classifier for one story. */
export function resetPriority(storyId: number, userId: number, db: DB = getDb(), now = Date.now()) {
  const s = getStory(db, storyId);
  const src = db.select().from(sources).where(eq(sources.id, s.sourceId)).get()!;
  const c = classifyStory({ title: s.title, description: s.description, publishedAt: s.publishedAt ?? s.firstDetectedAt, source: profileOf(src) }, getSettings(db).priorityRules, now);
  db.transaction((tx) => {
    tx.update(stories)
      .set({ priority: c.priority, priorityScore: c.score, priorityReason: c.reason, priorityOverridden: false, category: c.category, geoRelevance: c.geoRelevance, sensitive: c.sensitive, updatedAt: now })
      .where(eq(stories.id, storyId))
      .run();
    tx.insert(storyPriorityHistory).values({ storyId, fromPriority: s.priority, toPriority: c.priority, reason: "Override removed; automatic classification restored", changedBy: userId, changedAt: now }).run();
  });
  audit("story.priority_reset", "story", storyId, userId, { from: s.priority, to: c.priority }, db);
}

export function markVerified(storyId: number, userId: number, db: DB = getDb()) {
  db.update(stories).set({ verificationStatus: "verified_by_staff", updatedAt: Date.now() }).where(eq(stories.id, storyId)).run();
  audit("story.verified", "story", storyId, userId, undefined, db);
}

export function assignFollowUp(
  storyId: number,
  input: { assigneeId: number | null; dueAt: number | null; note?: string },
  userId: number,
  db: DB = getDb(),
  now = Date.now(),
) {
  const s = getStory(db, storyId);
  if (input.assigneeId) {
    const a = db.select().from(users).where(and(eq(users.id, input.assigneeId), eq(users.status, "active"))).get();
    if (!a) throw new Error("Assignee must be an active staff member.");
  }
  const id = db.transaction((tx) => {
    const existing = tx.select().from(followUps).where(eq(followUps.storyId, storyId)).get();
    let fuId: number;
    if (existing) {
      tx.update(followUps).set({ assigneeId: input.assigneeId, dueAt: input.dueAt, completedAt: null, updatedAt: now }).where(eq(followUps.id, existing.id)).run();
      fuId = existing.id;
    } else {
      fuId = tx.insert(followUps).values({ storyId, assigneeId: input.assigneeId, dueAt: input.dueAt, createdBy: userId, createdAt: now, updatedAt: now }).returning({ id: followUps.id }).get().id;
    }
    if (input.note?.trim()) tx.insert(followUpNotes).values({ followUpId: fuId, authorId: userId, body: input.note.trim().slice(0, 4000), createdAt: now }).run();
    tx.update(stories).set({ reviewStatus: "assigned", updatedAt: now }).where(eq(stories.id, storyId)).run();
    return fuId;
  });
  audit("follow_up.assigned", "story", storyId, userId, { assigneeId: input.assigneeId, dueAt: input.dueAt, from: s.reviewStatus }, db);
  return id;
}

export function addFollowUpNote(storyId: number, body: string, userId: number, db: DB = getDb(), now = Date.now()) {
  const text = body.trim();
  if (!text) throw new Error("Note cannot be empty.");
  let fu = db.select().from(followUps).where(eq(followUps.storyId, storyId)).get();
  if (!fu) {
    getStory(db, storyId);
    fu = db.insert(followUps).values({ storyId, createdBy: userId, createdAt: now, updatedAt: now }).returning().get();
  }
  db.insert(followUpNotes).values({ followUpId: fu.id, authorId: userId, body: text.slice(0, 4000), createdAt: now }).run();
  db.update(followUps).set({ updatedAt: now }).where(eq(followUps.id, fu.id)).run();
  audit("follow_up.note_added", "story", storyId, userId, undefined, db);
}
