import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import { audit } from "./audit";
import { isAllowedEmail } from "./auth/access";
import { ROLE_LABELS } from "./auth/permissions";
import { createInvitation } from "./auth/users";
import { first, getDb, type DB } from "./db/client";
import { accessRequests, featureRequests, notifications, users, type Role } from "./db/schema";
import { developerContact } from "./developer";
import { env } from "./env";
import { deliverNotification } from "./notify/deliver";
import { accessRequestRecipients } from "./notify/recipients";
import { renderAccessRequest, renderFeatureRequest } from "./notify/templates/emails";

const HOUR = 3600_000;
/** Public form: global cap so the unauthenticated endpoint cannot be used to flood administrators. */
const MAX_ACCESS_REQUESTS_PER_HOUR = 20;
const MAX_FEATURE_REQUESTS_PER_USER_PER_DAY = 10;

export const ACCESS_REQUEST_RECEIVED =
  "Thank you. Your request has been sent to the News Desk administrators. If it is approved, you will receive an invitation at your work email.";

/**
 * Someone without an account asks to join. Always returns the same message (whether or not the person
 * already has an account) so the form cannot be used to discover who has access.
 */
export async function createAccessRequest(
  input: { name: string; email: string; department?: string; requestedRole?: Role; reason?: string },
  db: DB = getDb(),
  now = Date.now(),
): Promise<{ message: string; requestId: number | null }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim().slice(0, 100);
  if (!name) throw new Error("Please enter your name.");
  if (!isAllowedEmail(email)) throw new Error(`Please use your @${env().ALLOWED_EMAIL_DOMAIN} work email.`);
  const requestedRole: Role = input.requestedRole && input.requestedRole !== "admin" ? input.requestedRole : "member";

  const recent = (await first(
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(accessRequests)
      .where(gte(accessRequests.createdAt, now - HOUR)),
  ))!.n;
  if (recent >= MAX_ACCESS_REQUESTS_PER_HOUR) throw new Error("Too many requests right now. Please try again later or contact support.");

  const existingUser = await first(db.select().from(users).where(eq(users.email, email)));
  const pending = await first(
    db
      .select()
      .from(accessRequests)
      .where(and(eq(accessRequests.email, email), eq(accessRequests.status, "pending"))),
  );
  if (existingUser?.status === "active" || pending) return { message: ACCESS_REQUEST_RECEIVED, requestId: null };

  const row = (
    await db
      .insert(accessRequests)
      .values({
        email,
        name,
        department: (input.department ?? "").trim().slice(0, 120),
        requestedRole,
        reason: (input.reason ?? "").trim().slice(0, 1000),
        createdAt: now,
      })
      .returning()
  )[0];
  await audit("access_request.created", "access_request", row.id, null, { email, requestedRole }, db);

  const recipients = await accessRequestRecipients(db);
  if (recipients) {
    const rendered = renderAccessRequest({ ...row, requestedRole: ROLE_LABELS[row.requestedRole], appUrl: env().APP_URL });
    const n = (
      await db
        .insert(notifications)
        .values({
          kind: "access_request",
          dedupeKey: `access-request:${row.id}`,
          recipient: recipients,
          ...rendered,
          status: "pending",
          meta: { requestId: row.id },
          createdAt: now,
        })
        .returning({ id: notifications.id })
    )[0];
    await deliverNotification(n.id, db, now);
  }
  return { message: ACCESS_REQUEST_RECEIVED, requestId: row.id };
}

/** "dashboard" = pending plus anything handled in the last 24 h (so admins see the outcome of their action). */
export async function listAccessRequests(scope: "dashboard" | "all" = "dashboard", db: DB = getDb(), now = Date.now()) {
  return await db
    .select({ r: accessRequests, reviewer: users.name, reviewerEmail: users.email })
    .from(accessRequests)
    .leftJoin(users, eq(users.id, accessRequests.reviewedBy))
    .where(scope === "dashboard" ? or(eq(accessRequests.status, "pending"), gte(accessRequests.reviewedAt, now - 24 * HOUR)) : undefined)
    .orderBy(desc(accessRequests.createdAt), desc(accessRequests.id))
    .limit(50);
}

async function getPending(id: number, db: DB) {
  const r = await first(db.select().from(accessRequests).where(eq(accessRequests.id, id)));
  if (!r) throw new Error("Request not found.");
  if (r.status !== "pending") throw new Error("This request has already been handled.");
  return r;
}

/** Approval issues a normal single-use invitation, so the person still proves control of the mailbox. */
export async function approveAccessRequest(id: number, role: Role, admin: { id: number; name: string }, db: DB = getDb(), now = Date.now()) {
  const r = await getPending(id, db);
  const existing = await first(db.select().from(users).where(eq(users.email, r.email)));
  if (existing?.status !== "active") {
    await createInvitation({ email: r.email, name: r.name, role, invitedBy: admin }, db, now);
  }
  await db
    .update(accessRequests)
    .set({ status: "approved", grantedRole: role, reviewedBy: admin.id, reviewedAt: now })
    .where(eq(accessRequests.id, id));
  await audit("access_request.approved", "access_request", id, admin.id, { email: r.email, role }, db);
}

export async function declineAccessRequest(id: number, adminId: number, db: DB = getDb(), now = Date.now()) {
  const r = await getPending(id, db);
  await db.update(accessRequests).set({ status: "declined", reviewedBy: adminId, reviewedAt: now }).where(eq(accessRequests.id, id));
  await audit("access_request.declined", "access_request", id, adminId, { email: r.email }, db);
}

const CATEGORY_LABELS = {
  feature: "New feature",
  improvement: "Improvement",
  bug: "Problem / bug",
  source: "New news source",
  other: "Other",
} as const;
const IMPORTANCE_LABELS = { nice_to_have: "Nice to have", important: "Important", urgent: "Urgent" } as const;
export { CATEGORY_LABELS as FEATURE_CATEGORY_LABELS, IMPORTANCE_LABELS as FEATURE_IMPORTANCE_LABELS };

/** Stores the request and emails it to the developer (simulated in the outbox until live email is configured). */
export async function submitFeatureRequest(
  input: {
    title: string;
    description: string;
    category: keyof typeof CATEGORY_LABELS;
    importance: keyof typeof IMPORTANCE_LABELS;
    page?: string | null;
    user: { id: number; email: string; name: string };
  },
  db: DB = getDb(),
  now = Date.now(),
) {
  const title = input.title.trim().slice(0, 150);
  const description = input.description.trim().slice(0, 4000);
  if (!title) throw new Error("Please give the request a short title.");
  if (description.length < 10) throw new Error("Please describe the request in a sentence or two.");
  const today = (await first(
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(featureRequests)
      .where(and(eq(featureRequests.requesterId, input.user.id), gte(featureRequests.createdAt, now - 24 * HOUR))),
  ))!.n;
  if (today >= MAX_FEATURE_REQUESTS_PER_USER_PER_DAY) throw new Error("You've reached today's limit for feature requests. Thank you for the ideas!");

  const dev = developerContact();
  const row = (
    await db
      .insert(featureRequests)
      .values({
        title,
        description,
        category: input.category,
        importance: input.importance,
        requesterId: input.user.id,
        requesterEmail: input.user.email,
        page: input.page?.slice(0, 200) || null,
        createdAt: now,
      })
      .returning()
  )[0];
  const rendered = renderFeatureRequest({
    id: row.id,
    title,
    description,
    category: CATEGORY_LABELS[input.category],
    importance: IMPORTANCE_LABELS[input.importance],
    requester: `${input.user.name || input.user.email} <${input.user.email}>`,
    page: row.page,
    createdAt: now,
    developerName: dev.name,
    appUrl: env().APP_URL,
  });
  const n = (
    await db
      .insert(notifications)
      .values({
        kind: "feature_request",
        dedupeKey: `feature-request:${row.id}`,
        recipient: dev.email,
        ...rendered,
        status: "pending",
        meta: { featureRequestId: row.id, replyTo: input.user.email },
        createdAt: now,
      })
      .returning({ id: notifications.id })
  )[0];
  await db.update(featureRequests).set({ notificationId: n.id }).where(eq(featureRequests.id, row.id));
  const delivered = await deliverNotification(n.id, db, now);
  await audit("feature_request.submitted", "feature_request", row.id, input.user.id, { title }, db);
  return { id: row.id, deliveryStatus: delivered?.status ?? "pending", developerEmail: dev.email };
}

export async function listFeatureRequests(db: DB = getDb()) {
  return await db
    .select({ f: featureRequests, delivery: notifications.status })
    .from(featureRequests)
    .leftJoin(notifications, eq(notifications.id, featureRequests.notificationId))
    .orderBy(desc(featureRequests.createdAt), desc(featureRequests.id))
    .limit(50);
}

export async function setFeatureRequestStatus(
  id: number,
  status: (typeof featureRequests.$inferSelect)["status"],
  adminId: number,
  db: DB = getDb(),
) {
  await db.update(featureRequests).set({ status }).where(eq(featureRequests.id, id));
  await audit("feature_request.status_changed", "feature_request", id, adminId, { status }, db);
}
