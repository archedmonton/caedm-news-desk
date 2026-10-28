import { eq } from "drizzle-orm";
import { upsertStory } from "../ingest/collector";
import { getSettings } from "../settings";
import { first, type DB } from "./client";
import { followUpNotes, followUps, sources, stories, users } from "./schema";

const BASE = "https://example.org/caedm-news-desk-sample";

/**
 * Clearly labelled development/test data. Links point to example.org and every headline starts with
 * "[Sample]". Never used in production.
 */
export async function seedSampleData(db: DB, now = Date.now()) {
  let src = await first(db.select().from(sources).where(eq(sources.slug, "sample")));
  if (!src) {
    src = (
      await db
        .insert(sources)
        .values({
          slug: "sample",
          name: "Sample data (development)",
          websiteUrl: "https://example.org",
          feedUrl: null,
          method: "manual",
          adapter: "manual",
          orgType: "catholic_partner",
          region: "edmonton",
          importance: 4,
          defaultCategory: "community",
          verified: false,
          enabled: false,
          notes: "Development sample records. Not a real source.",
        })
        .returning()
    )[0];
  }
  const rules = (await getSettings(db)).priorityRules;
  const h = (n: number) => now - n * 3600_000;
  const items: [string, string, string | null, number][] = [
    [
      "archbishop-statement",
      "[Sample] Archdiocese of Edmonton responds to emergency closure of parish hall",
      "A sample statement used to demonstrate a critical, time-sensitive item.",
      h(1),
    ],
    [
      "school-policy",
      "[Sample] Province announces Catholic school funding policy changes",
      "Sample description: new legislation affects separate school funding in Alberta.",
      h(3),
    ],
    [
      "hospital-safety",
      "[Sample] Misericordia hospital introduces new safety measures",
      "Sample description for a local Catholic healthcare development.",
      h(5),
    ],
    ["parish-event", "[Sample] Edmonton parish hosts Advent concert and fundraiser", "Sample event announcement from a local parish.", h(8)],
    [
      "allegation",
      "[Sample] Allegations reported involving Edmonton Catholic organization",
      "Sample of a sensitive, unverified claim requiring human review.",
      h(2),
    ],
    ["vatican-routine", "[Sample] Vatican hosts international conference on peace", null, h(12)],
    ["newsletter", "[Sample] Monthly newsletter now available", "Routine sample announcement.", h(20)],
  ];
  const ids: number[] = [];
  for (const [slug, title, description, publishedAt] of items) {
    const id = await upsertStory(
      db,
      src,
      {
        title,
        url: `${BASE}/${slug}`,
        publishedAt,
        updatedAt: null,
        description,
        descriptionSource: description ? "listing" : "none",
        categories: [],
      },
      { now: Math.min(now, publishedAt + 10 * 60_000), rules, baseline: false, isSample: true },
    );
    if (id) ids.push(id);
  }
  // One sample follow-up with a note.
  const target = await first(
    db
      .select()
      .from(stories)
      .where(eq(stories.canonicalUrl, `${BASE}/school-policy`)),
  );
  const assignee = await first(db.select().from(users).where(eq(users.status, "active")));
  if (target && ids.includes(target.id)) {
    const fu = (
      await db
        .insert(followUps)
        .values({ storyId: target.id, assigneeId: assignee?.id ?? null, dueAt: now + 24 * 3600_000, createdBy: assignee?.id ?? null })
        .returning()
    )[0];
    await db.update(stories).set({ reviewStatus: "assigned" }).where(eq(stories.id, target.id));
    await db
      .insert(followUpNotes)
      .values({ followUpId: fu.id, authorId: assignee?.id ?? null, body: "Sample note: confirm impact with the Catholic Education office." });
  }
  return ids.length;
}
