import { eq } from "drizzle-orm";
import { developerContact } from "../developer";
import { isProduction } from "../env";
import { SOURCE_REGISTRY } from "../ingest/registry";
import { first, type DB } from "./client";
import { sources, users } from "./schema";

/**
 * Idempotent: inserts registry sources that don't exist yet. Existing rows are never overwritten, because
 * administrators own sources after the first seed (they can edit, verify, enable and disable them in the app).
 */
export async function seedSources(db: DB) {
  const now = Date.now();
  const rows = SOURCE_REGISTRY.map((def) => ({
    slug: def.slug,
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
    verifiedAt: def.verified ? now : null,
    enabled: def.verified && def.enabledByDefault,
    notes: def.notes,
    origin: "registry" as const,
    createdAt: now,
    updatedAt: now,
  }));
  const inserted = await db.insert(sources).values(rows).onConflictDoNothing({ target: sources.slug }).returning({ id: sources.id });
  return inserted.length;
}

/**
 * Ensures the developer's account exists as a protected administrator. In development it is active (usable
 * through development sign-in); in production it starts as "invited" and needs an invitation to set a password.
 */
export async function ensureDeveloperAdmin(db: DB) {
  const dev = developerContact();
  const now = Date.now();
  const existing = await first(db.select().from(users).where(eq(users.email, dev.email)));
  if (existing) {
    await db
      .update(users)
      .set({ role: "admin", isDeveloper: true, name: existing.name || dev.name, updatedAt: now })
      .where(eq(users.id, existing.id));
    return { created: false, status: existing.status };
  }
  const status = isProduction() ? ("invited" as const) : ("active" as const);
  await db
    .insert(users)
    .values({
      email: dev.email,
      name: dev.name,
      role: "admin",
      status,
      isDeveloper: true,
      notifyAccessRequests: true,
      createdAt: now,
      updatedAt: now,
    });
  return { created: true, status };
}
