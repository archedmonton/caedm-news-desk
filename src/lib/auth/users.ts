import { and, eq, gt, isNull } from "drizzle-orm";
import { audit } from "../audit";
import { first, getDb, type DB } from "../db/client";
import { invitations, notifications, sessions, users, type Role } from "../db/schema";
import { env } from "../env";
import { sha256 } from "../ingest/url";
import { deliverNotification } from "../notify/deliver";
import { renderInvite } from "../notify/templates/emails";
import { isAllowedEmail } from "./access";
import { hashPassword, passwordProblem, randomToken, verifyPassword } from "./password";

const INVITE_TTL_MS = 72 * 3600_000;
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60_000;

export async function createInvitation(
  input: { email: string; role: Role; invitedBy: { id: number; name: string } | null },
  db: DB = getDb(),
  now = Date.now(),
) {
  const email = input.email.trim().toLowerCase();
  if (!isAllowedEmail(email)) throw new Error(`Only @${env().ALLOWED_EMAIL_DOMAIN} addresses can be invited.`);
  const existing = await first(db.select().from(users).where(eq(users.email, email)));
  if (existing?.status === "active") throw new Error("That person already has an active account.");
  const role: Role = existing?.isDeveloper ? "admin" : input.role;
  let userId: number;
  if (existing) {
    userId = existing.id;
    await db.update(users).set({ role, status: "invited", updatedAt: now }).where(eq(users.id, userId));
  } else {
    [{ id: userId }] = await db.insert(users).values({ email, role, status: "invited", createdAt: now, updatedAt: now }).returning({ id: users.id });
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
  const rendered = renderInvite({ inviteUrl, role, invitedBy: input.invitedBy?.name || "A CAEDM News Desk administrator", expiresAt });
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
  await audit("user.invited", "user", userId, input.invitedBy?.id ?? null, { email, role }, db);
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

export async function setUserRole(userId: number, role: Role, actorId: number, db: DB = getDb()) {
  if (userId === actorId && role !== "admin") throw new Error("You cannot remove your own administrator role.");
  await assertNotDeveloper(userId, db);
  await db.update(users).set({ role, updatedAt: Date.now() }).where(eq(users.id, userId));
  await audit("user.role_changed", "user", userId, actorId, { role }, db);
}

export type NotificationPreferences = {
  notifyDigest: boolean;
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
