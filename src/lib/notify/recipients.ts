import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "../db/client";
import { users } from "../db/schema";

/** Comma-separated, de-duplicated recipient list (team mailbox first). */
export function joinRecipients(...lists: (string | string[] | null | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of lists.flat()) {
    for (const addr of String(item ?? "").split(",")) {
      const a = addr.trim().toLowerCase();
      if (a && !seen.has(a)) {
        seen.add(a);
        out.push(a);
      }
    }
  }
  return out.join(", ");
}

const active = eq(users.status, "active");

export function digestRecipients(db: DB, teamAddress: string) {
  const personal = db.select({ email: users.email }).from(users).where(and(active, eq(users.notifyDigest, true))).all();
  return joinRecipients(teamAddress, personal.map((p) => p.email));
}

/** Users choosing "p0" only receive alerts that contain at least one P0 story. */
export function alertRecipients(db: DB, teamAddress: string, containsP0: boolean) {
  const prefs = containsP0 ? (["all", "p0"] as const) : (["all"] as const);
  const personal = db.select({ email: users.email }).from(users).where(and(active, inArray(users.notifyAlerts, [...prefs]))).all();
  return joinRecipients(teamAddress, personal.map((p) => p.email));
}

export function accessRequestRecipients(db: DB) {
  const admins = db
    .select({ email: users.email })
    .from(users)
    .where(and(active, eq(users.role, "admin"), eq(users.notifyAccessRequests, true)))
    .all();
  return joinRecipients(admins.map((a) => a.email));
}
