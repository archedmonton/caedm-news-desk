import "./_bootstrap";
import { closeDb, getDb } from "../src/lib/db/client";
import { sources } from "../src/lib/db/schema";
import { checkSource } from "../src/lib/ingest/collector";

async function main() {
  // Usage: npm run collect                   (all enabled, verified sources, ignoring the schedule)
  //        npm run collect -- vatican-news   (one source by slug)
  const slug = process.argv[2];
  const db = getDb();
  const list = (await db.select().from(sources)).filter((s) => (slug ? s.slug === slug : s.enabled && s.verified && s.method !== "manual"));
  if (!list.length) {
    console.error(slug ? `No source "${slug}"` : "No enabled sources");
    process.exitCode = 1;
    return;
  }
  let failures = 0;
  for (const s of list) {
    const r = await checkSource(s.id, { db, trigger: "manual" });
    if (r.status === "error") failures++;
    console.log(`${r.status === "success" ? "✓" : "✗"} ${s.name}: ${r.itemsFound} found, ${r.itemsNew} new${r.error ? ` — ${r.error}` : ""}`);
    for (const w of r.warnings) console.log(`   ! ${w}`);
  }
  process.exitCode = failures ? 2 : 0;
}

void main().finally(closeDb);
