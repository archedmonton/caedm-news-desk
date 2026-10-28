import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { first, pgliteHandle, setDb, type DB } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { sources } from "@/lib/db/schema";
import { seedSources } from "@/lib/db/seed";

let template: Promise<PGlite> | null = null;
let current: { close: () => Promise<void> } | null = null;

async function migratedTemplate() {
  const client = new PGlite();
  const { db } = pgliteHandle(client);
  await runMigrations(db, "pglite");
  await seedSources(db);
  return client;
}

/** Fresh in-memory Postgres (a clone of a migrated, seeded template) that `getDb()` also returns. */
export async function testDb(): Promise<DB> {
  template ??= migratedTemplate();
  const client = (await (await template).clone()) as PGlite;
  await current?.close();
  const handle = pgliteHandle(client);
  current = handle;
  setDb(handle);
  return handle.db;
}

export async function sourceBySlug(db: DB, slug: string) {
  return (await first(db.select().from(sources).where(eq(sources.slug, slug))))!;
}

export function fakeFetcher(routes: Record<string, string | Error | (() => string)>) {
  const calls: string[] = [];
  const fetcher = async (url: string) => {
    calls.push(url);
    const r = routes[url];
    if (r === undefined) throw Object.assign(new Error(`HTTP 404 from test (${url})`), { status: 404 });
    if (r instanceof Error) throw r;
    return { url, status: 200, contentType: "text/html", body: typeof r === "function" ? r() : r };
  };
  return { fetcher, calls };
}
