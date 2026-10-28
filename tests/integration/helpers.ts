import { eq } from "drizzle-orm";
import { openDatabase, setDb, type DB } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { sources } from "@/lib/db/schema";
import { seedSources } from "@/lib/db/seed";

/** Fresh in-memory database with migrations and the source registry. */
export function testDb(): DB {
  const { db, sqlite } = openDatabase(":memory:");
  runMigrations(db);
  seedSources(db);
  setDb(db, sqlite);
  return db;
}

export function sourceBySlug(db: DB, slug: string) {
  return db.select().from(sources).where(eq(sources.slug, slug)).get()!;
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
