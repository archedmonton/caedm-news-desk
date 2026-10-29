import { eq } from "drizzle-orm";
import { first, getDb, type DB } from "../db/client";
import { notifications, stories, users } from "../db/schema";
import { env } from "../env";
import { deliverNotification } from "./deliver";
import { renderAssignment, renderPasswordChanged } from "./templates/emails";

/** Email the assignee, unless they assigned themselves or turned assignment emails off. */
export async function notifyAssignment(
  input: { storyId: number; followUpId: number; assigneeId: number | null; actorId: number; dueAt: number | null; note?: string },
  db: DB = getDb(),
  now = Date.now(),
) {
  if (!input.assigneeId || input.assigneeId === input.actorId) return null;
  const assignee = await first(db.select().from(users).where(eq(users.id, input.assigneeId)));
  if (!assignee || assignee.status !== "active" || !assignee.notifyAssignments) return null;
  const story = await first(db.select().from(stories).where(eq(stories.id, input.storyId)));
  const actor = await first(db.select().from(users).where(eq(users.id, input.actorId)));
  if (!story) return null;
  const rendered = renderAssignment({
    storyTitle: story.title,
    storyUrl: story.canonicalUrl,
    storyId: story.id,
    priority: story.priority,
    assignedBy: actor?.name || actor?.email || "A colleague",
    dueAt: input.dueAt,
    note: input.note?.trim() || null,
    appUrl: env().APP_URL,
  });
  const row = (
    await db
      .insert(notifications)
      .values({
        kind: "assignment",
        dedupeKey: `assignment:${input.followUpId}:${assignee.id}:${now}`,
        recipient: assignee.email,
        ...rendered,
        status: "pending",
        meta: { storyId: story.id, assigneeId: assignee.id },
        createdAt: now,
      })
      .returning({ id: notifications.id })
  )[0];
  await deliverNotification(row.id, db, now);
  return row.id;
}

/** Security notice after a password change. Always sent: there is no opt-out for security email. */
export async function notifyPasswordChanged(
  user: { id: number; email: string; name: string },
  otherSessionsEnded: number,
  db: DB = getDb(),
  now = Date.now(),
) {
  const rendered = renderPasswordChanged({
    name: user.name || user.email,
    when: now,
    otherSessionsEnded,
    appUrl: env().APP_URL,
    supportEmail: env().DEVELOPER_EMAIL,
  });
  const row = (
    await db
      .insert(notifications)
      .values({
        kind: "security",
        dedupeKey: `password-changed:${user.id}:${now}`,
        recipient: user.email,
        ...rendered,
        status: "pending",
        meta: { userId: user.id },
        createdAt: now,
      })
      .returning({ id: notifications.id })
  )[0];
  await deliverNotification(row.id, db, now);
  return row.id;
}
