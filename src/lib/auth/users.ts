import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { audit } from "../audit";
import { first, getDb, type DB } from "../db/client";
import {
  accessRequests,
  applicationSettings,
  auditLogs,
  featureRequests,
  followUpNotes,
  followUps,
  invitations,
  notifications,
  storyPriorityHistory,
  sessions,
  sources,
  users,
  type Role,
} from "../db/schema";
import { env } from "../env";
import { sha256 } from "../ingest/url";
import { deliverNotification } from "../notify/deliver";
import { notifyPasswordChanged } from "../notify/personal";
import { renderInvite } from "../notify/templates/emails";
import { isAllowedEmail } from "./access";
import { hashPassword, passwordProblem, randomToken, verifyPassword } from "./password";

const INVITE_TTL_MS = 72 * 3600_000;
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60_000;

export async function createInvitation(
  input: { email: string; name?: string; role: Role; invitedBy: { id: number; name: string } | null },
  db: DB = getDb(),
  now = Date.now(),
) {
  const email = input.email.trim().toLowerCase();
  if (!isAllowedEmail(email)) throw new Error(`Only @${env().ALLOWED_EMAIL_DOMAIN} addresses can be invited.`);
  const existing = await first(db.select().from(users).where(eq(users.email, email)));
  if (existing?.status === "active") throw new Error("That person already has an active account.");
  const role: Role = existing?.isDeveloper ? "admin" : input.role;
  // The name personalises the email and pre-fills the sign-up form; the invitee can correct it there.
  const name = input.name?.trim().slice(0, 100) || existing?.name || "";
  let userId: number;
  if (existing) {
    userId = existing.id;
    await db.update(users).set({ name, role, status: "invited", updatedAt: now }).where(eq(users.id, userId));
  } else {
    [{ id: userId }] = await db
      .insert(users)
      .values({ email, name, role, status: "invited", createdAt: now, updatedAt: now })
      .returning({ id: users.id });
  }
  // Revoke previous outstanding invitations for this address.
  await db
    .update(invitations)
    .set({ revokedAt: now })
    .where(and(eq(invitations.email, email), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
  const token = randomToken();
  const expiresAt = now + INVITE_TTL_MS;
  await db.insert(invitations).values({ email, role, tokenHash: sha256(token), invitedBy: input.invitedBy?.id ?? null, expiresAt, createdAt: now });
  const inviteUrl = `${env().APP_URL}/invite/${token}`;
  const rendered = renderInvite({
    name,
    email,
    inviteUrl,
    role,
    invitedBy: input.invitedBy?.name || "A CAEDM News Desk administrator",
    expiresAt,
    appUrl: env().APP_URL,
    support: { name: env().DEVELOPER_NAME, email: env().DEVELOPER_EMAIL },
  });
  const [n] = await db
    .insert(notifications)
    .values({
      kind: "invite",
      dedupeKey: `invite:${sha256(token).slice(0, 24)}`,
      recipient: email,
      ...rendered,
      status: "pending",
      meta: { userId },
      createdAt: now,
    })
    .returning({ id: notifications.id });
  await deliverNotification(n.id, db, now);
  await audit("user.invited", "user", userId, input.invitedBy?.id ?? null, { email, name, role }, db);
  return { userId, inviteUrl, notificationId: n.id, expiresAt };
}

export async function findInvitation(token: string, db: DB = getDb(), now = Date.now()) {
  return first(
    db
      .select()
      .from(invitations)
      .where(
        and(eq(invitations.tokenHash, sha256(token)), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, now)),
      ),
  );
}

export async function acceptInvitation(input: { token: string; name: string; password: string }, db: DB = getDb(), now = Date.now()) {
  const inv = await findInvitation(input.token, db, now);
  if (!inv) throw new Error("This invitation is invalid, expired or already used.");
  const problem = passwordProblem(input.password);
  if (problem) throw new Error(problem);
  const name = input.name.trim().slice(0, 100);
  if (!name) throw new Error("Please enter your name.");
  const passwordHash = await hashPassword(input.password);
  const user = await first(db.select().from(users).where(eq(users.email, inv.email)));
  if (!user) throw new Error("Invited account no longer exists.");
  await db.transaction(async (tx) => {
    // Conditional update keeps the token single-use even if two requests race.
    const used = await tx
      .update(invitations)
      .set({ acceptedAt: now })
      .where(and(eq(invitations.id, inv.id), isNull(invitations.acceptedAt)))
      .returning({ id: invitations.id });
    if (!used.length) throw new Error("This invitation is invalid, expired or already used.");
    await tx
      .update(users)
      .set({ name, passwordHash, role: inv.role, status: "active", failedLogins: 0, lockedUntil: null, updatedAt: now })
      .where(eq(users.id, user.id));
  });
  await audit("user.invitation_accepted", "user", user.id, user.id, { email: inv.email }, db);
  return user.id;
}

export async function authenticate(emailRaw: string, password: string, db: DB = getDb(), now = Date.now()) {
  const email = emailRaw.trim().toLowerCase();
  const user = await first(db.select().from(users).where(eq(users.email, email)));
  const generic = "Email or password is incorrect.";
  if (!user || user.status !== "active") {
    await verifyPassword(password, null);
    throw new Error(generic);
  }
  if (user.lockedUntil && user.lockedUntil > now) throw new Error("Too many failed attempts. Try again in 15 minutes.");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLogins + 1;
    await db
      .update(users)
      .set({ failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? now + LOCK_MS : null })
      .where(eq(users.id, user.id));
    await audit("auth.login_failed", "user", user.id, null, { failed }, db);
    throw new Error(generic);
  }
  await audit("auth.login", "user", user.id, user.id, undefined, db);
  return user;
}

async function assertNotDeveloper(userId: number, db: DB) {
  const target = await first(db.select().from(users).where(eq(users.id, userId)));
  if (!target) throw new Error("User not found.");
  if (target.isDeveloper) throw new Error("The developer administrator account is protected and cannot be changed here.");
}

export async function setUserStatus(userId: number, status: "active" | "disabled", actorId: number, db: DB = getDb()) {
  if (userId === actorId && status === "disabled") throw new Error("You cannot disable your own account.");
  await assertNotDeveloper(userId, db);
  await db.update(users).set({ status, updatedAt: Date.now() }).where(eq(users.id, userId));
  if (status === "disabled") await db.delete(sessions).where(eq(sessions.userId, userId));
  await audit(`user.${status === "disabled" ? "disabled" : "enabled"}`, "user", userId, actorId, undefined, db);
}

/** Administrators may promote anyone (including to administrator) and demote other administrators, never themselves. */
export async function setUserRole(userId: number, role: Role, actorId: number, db: DB = getDb()) {
  if (userId === actorId) throw new Error("You cannot change your own role. Ask another administrator.");
  await assertNotDeveloper(userId, db);
  const before = await first(db.select({ role: users.role }).from(users).where(eq(users.id, userId)));
  await db.update(users).set({ role, updatedAt: Date.now() }).where(eq(users.id, userId));
  await audit("user.role_changed", "user", userId, actorId, { from: before?.role, role }, db);
}

/**
 * Permanently removes an account (or an unaccepted invitation). Their past work stays: follow-ups, notes,
 * priority changes and audit entries are kept but no longer linked to a person, and assigned follow-ups become
 * unassigned. The email address can be invited again later.
 */
export async function deleteUser(userId: number, actorId: number, db: DB = getDb(), now = Date.now()) {
  if (userId === actorId) throw new Error("You cannot delete your own account.");
  await assertNotDeveloper(userId, db);
  const target = await first(db.select().from(users).where(eq(users.id, userId)));
  if (!target) throw new Error("User not found.");
  await db.transaction(async (tx) => {
    await tx.update(followUps).set({ assigneeId: null, updatedAt: now }).where(eq(followUps.assigneeId, userId));
    await tx.update(followUps).set({ createdBy: null }).where(eq(followUps.createdBy, userId));
    await tx.update(followUpNotes).set({ authorId: null }).where(eq(followUpNotes.authorId, userId));
    await tx.update(storyPriorityHistory).set({ changedBy: null }).where(eq(storyPriorityHistory.changedBy, userId));
    await tx.update(sources).set({ verifiedBy: null }).where(eq(sources.verifiedBy, userId));
    await tx.update(invitations).set({ invitedBy: null }).where(eq(invitations.invitedBy, userId));
    await tx
      .update(invitations)
      .set({ revokedAt: now })
      .where(and(eq(invitations.email, target.email), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
    await tx.update(applicationSettings).set({ updatedBy: null }).where(eq(applicationSettings.updatedBy, userId));
    await tx.update(accessRequests).set({ reviewedBy: null }).where(eq(accessRequests.reviewedBy, userId));
    await tx.update(featureRequests).set({ requesterId: null }).where(eq(featureRequests.requesterId, userId));
    // Keep accountability: the audit trail still says who did what, by email.
    await tx
      .update(auditLogs)
      .set({ userId: null, details: sql`coalesce(${auditLogs.details}, '{}'::jsonb) || jsonb_build_object('formerUser', ${target.email}::text)` })
      .where(eq(auditLogs.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });
  await audit("user.deleted", "user", userId, actorId, { email: target.email, name: target.name, role: target.role, status: target.status }, db);
}

export type NotificationPreferences = {
  notifyDigest: boolean;
  /** "HH:MM" Edmonton, or null to follow the team brief's time. */
  digestTime?: string | null;
  digestDays?: "daily" | "weekdays";
  digestScope?: "catholic" | "all";
  notifyAlerts: "all" | "p0" | "none";
  notifyAssignments: boolean;
  notifyAccessRequests: boolean;
};

/** Each account manages its own name and email notification preferences. */
export async function updateOwnAccount(userId: number, input: { name: string } & NotificationPreferences, db: DB = getDb()) {
  const name = input.name.trim().slice(0, 100);
  if (!name) throw new Error("Please enter your name.");
  await db
    .update(users)
    .set({ ...input, name, updatedAt: Date.now() })
    .where(eq(users.id, userId));
  await audit("account.updated", "user", userId, userId, { ...input, name }, db);
}

/**
 * Changes the signed-in user's own password. Wrong current passwords count towards the sign-in lockout, so a
 * hijacked session can't be used to guess the password. Every other session of the account is signed out.
 */
export async function changePassword(
  input: {
    userId: number;
    currentPassword: string;
    newPassword: string;
    keepSessionHash?: string | null;
  },
  db: DB = getDb(),
  now = Date.now(),
) {
  const user = await first(db.select().from(users).where(eq(users.id, input.userId)));
  if (!user || user.status !== "active") throw new Error("Account not found.");
  if (!user.passwordHash) throw new Error("This account has no password yet. Ask an administrator for an invitation.");
  if (user.lockedUntil && user.lockedUntil > now) throw new Error("Too many failed attempts. Try again in 15 minutes.");
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await db
      .update(users)
      .set({
        failedLogins: failed,
        lockedUntil: failed >= MAX_FAILED ? now + LOCK_MS : null,
      })
      .where(eq(users.id, user.id));
    await audit("user.password_change_failed", "user", user.id, user.id, { failed }, db);
    throw new Error("Your current password is incorrect.");
  }
  const problem = passwordProblem(input.newPassword);
  if (problem) throw new Error(problem);
  if (input.newPassword === input.currentPassword) throw new Error("Choose a new password that is different from your current one.");
  const passwordHash = await hashPassword(input.newPassword);
  const otherSessionsEnded = await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, failedLogins: 0, lockedUntil: null, updatedAt: now }).where(eq(users.id, user.id));
    const others = input.keepSessionHash
      ? and(eq(sessions.userId, user.id), ne(sessions.tokenHash, input.keepSessionHash))
      : eq(sessions.userId, user.id);
    return (await tx.delete(sessions).where(others).returning({ id: sessions.id })).length;
  });
  await audit("user.password_changed", "user", user.id, user.id, { otherSessionsEnded }, db);
  await notifyPasswordChanged(user, otherSessionsEnded, db, now);
  return { otherSessionsEnded };
}
