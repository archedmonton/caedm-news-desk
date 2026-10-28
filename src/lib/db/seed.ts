import { eq } from "drizzle-orm";
import { SOURCE_REGISTRY } from "../ingest/registry";
import type { DB } from "./client";
import { sources, users } from "./schema";
import { developerContact } from "../developer";
import { isProduction } from "../env";

/** Idempotent: inserts new registry entries and refreshes metadata; preserves admin-controlled state. */
export function seedSources(db: DB) {
  const now = Date.now();
  let inserted = 0;
  for (const def of SOURCE_REGISTRY) {
    const existing = db.select().from(sources).where(eq(sources.slug, def.slug)).get();
    const meta = {
      name: def.name,
      websiteUrl: def.websiteUrl,
      feedUrl: def.feedUrl,
      method: def.method,
      adapter: def.adapter,
      orgType: def.orgType,
      region: def.region,
      importance: def.importance,
      defaultCategory: def.defaultCategory,
      verified: def.verified,
      notes: def.notes,
      updatedAt: now,
    };
    if (existing) {
      db.update(sources)
        .set({ ...meta, enabled: def.verified ? existing.enabled : false })
        .where(eq(sources.id, existing.id))
        .run();
    } else {
      db.insert(sources).values({ slug: def.slug, ...meta, enabled: def.verified && def.enabledByDefault, createdAt: now }).run();
      inserted++;
    }
  }
  return inserted;
}

/**
 * Ensures the developer's account exists as a protected administrator. In development it is active (usable
 * through development sign-in); in production it starts as "invited" and needs an invitation to set a password.
 */
export function ensureDeveloperAdmin(db: DB) {
  const dev = developerContact();
  const now = Date.now();
  const existing = db.select().from(users).where(eq(users.email, dev.email)).get();
  if (existing) {
    db.update(users).set({ role: "admin", isDeveloper: true, name: existing.name || dev.name, updatedAt: now }).where(eq(users.id, existing.id)).run();
    return { created: false, status: existing.status };
  }
  const status = isProduction() ? "invited" : "active";
  db.insert(users)
    .values({ email: dev.email, name: dev.name, role: "admin", status, isDeveloper: true, notifyAccessRequests: true, createdAt: now, updatedAt: now })
    .run();
  return { created: true, status };
}
