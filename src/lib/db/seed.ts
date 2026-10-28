import { eq } from "drizzle-orm";
import { SOURCE_REGISTRY } from "../ingest/registry";
import type { DB } from "./client";
import { sources } from "./schema";

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
