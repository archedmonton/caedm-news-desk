import "./_bootstrap";
import fs from "node:fs";
import path from "node:path";
import { closeDb, getDb } from "../src/lib/db/client";
import { buildDigest } from "../src/lib/notify/digest";

async function main() {
  const out = path.resolve("data/previews");
  fs.mkdirSync(out, { recursive: true });
  const d = await buildDigest(getDb(), Date.now());
  const file = path.join(out, `digest-${Date.now()}.html`);
  fs.writeFileSync(file, d.html);
  console.log(d.subject);
  console.log(`${d.storyIds.length} stories · ${d.followUps.length} follow-ups`);
  for (const s of d.sections) if (s.stories.length) console.log(`  ${s.title}: ${s.stories.length}${s.more ? ` (+${s.more} more)` : ""}`);
  console.log(`Preview written to ${file} (nothing was sent or recorded)`);
}

void main().finally(closeDb);
