import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { first, getDb } from "../db/client";
import { sessions, users, type User } from "../db/schema";
import { isProduction } from "../env";
import { sha256 } from "../ingest/url";
import { productionAccess } from "./access";
import { randomToken } from "./password";
import { can, type Permission } from "./permissions";

export const SESSION_COOKIE = "newsdesk_session";
const IDLE_MS = 12 * 3600_000;
const ABSOLUTE_MS = 7 * 24 * 3600_000;
const TOUCH_EVERY_MS = 5 * 60_000;

export type SessionUser = Pick<User, "id" | "email" | "name" | "role">;

export async function createSession(userId: number) {
  const db = getDb();
  const token = randomToken();
  const now = Date.now();
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, expiresAt: now + ABSOLUTE_MS, lastSeenAt: now, createdAt: now });
  await db.update(users).set({ lastLoginAt: now, failedLogins: 0, lockedUntil: null }).where(eq(users.id, userId));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: ABSOLUTE_MS / 1000,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token)
    await getDb()
      .delete(sessions)
      .where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

/** Hash of this request's session token, so a password change can keep the current session signed in. */
export async function currentSessionHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}

/** Validates the session cookie against the database. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (!productionAccess().enabled) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const now = Date.now();
  const row = await first(
    db
      .select({
        sid: sessions.id,
        lastSeenAt: sessions.lastSeenAt,
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, now))),
  );
  if (!row || row.status !== "active" || now - row.lastSeenAt > IDLE_MS) return null;
  if (now - row.lastSeenAt > TOUCH_EVERY_MS) await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.sid));
  return { id: row.id, email: row.email, name: row.name, role: row.role };
});

export async function requireUser(permission: Permission = "read_news"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, permission)) throw new Error("You do not have permission to perform this action.");
  return user;
}

export const requireAdmin = () => requireUser("manage_staff");

/** For pages: people without the permission get a 404 rather than an error screen. */
export async function requirePageUser(permission: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, permission)) notFound();
  return user;
}
