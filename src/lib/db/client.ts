import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { env, isProduction } from "../env";
import * as schema from "./schema";

/** Works with both drivers: postgres-js (Supabase/production) and PGlite (local dev, tests). */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

type Handle = { db: DB; close: () => Promise<void>; kind: "postgres" | "pglite"; key: string };
const g = globalThis as unknown as { __newsdeskDb?: Handle };

/** postgres-js client. `prepare: false` is required by Supabase's transaction pooler (port 6543). */
export function openPostgres(url: string, opts: { max?: number } = {}): Handle {
  const client = postgres(url, {
    prepare: false,
    max: opts.max ?? env().DATABASE_POOL_MAX,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });
  return { db: drizzlePostgres(client, { schema }) as unknown as DB, close: () => client.end({ timeout: 5 }), kind: "postgres", key: url };
}

/** Wrap an existing PGlite instance (tests use in-memory instances and clones). */
export function pgliteHandle(client: PGlite): Handle {
  return { db: drizzlePglite(client, { schema }) as unknown as DB, close: () => client.close(), kind: "pglite", key: "memory" };
}

/**
 * File-backed PGlite for zero-setup local development. PGlite is single-process, so a lock file stops a
 * second process (e.g. a CLI script while `npm run dev` is running) from corrupting the data directory.
 */
function openPgliteDir(dir: string): Handle {
  const abs = path.resolve(dir);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const lock = `${abs}.lock`;
  try {
    const pid = Number(fs.readFileSync(lock, "utf8"));
    if (pid && pid !== process.pid) {
      let alive = false;
      try {
        process.kill(pid, 0);
        alive = true;
      } catch {
        /* stale lock */
      }
      if (alive) {
        throw new Error(
          `The local database (${dir}) is in use by process ${pid}, probably "npm run dev". Stop it first, or set DATABASE_URL to a Postgres database.`,
        );
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  fs.writeFileSync(lock, String(process.pid));
  process.once("exit", () => {
    try {
      if (fs.readFileSync(lock, "utf8") === String(process.pid)) fs.rmSync(lock);
    } catch {
      /* ignore */
    }
  });
  const client = new PGlite(abs);
  return { db: drizzlePglite(client, { schema }) as unknown as DB, close: () => client.close(), kind: "pglite", key: abs };
}

function openFromEnv(): Handle {
  const e = env();
  if (e.DATABASE_URL) return openPostgres(e.DATABASE_URL);
  if (isProduction()) throw new Error("DATABASE_URL is required in production (Supabase transaction pooler connection string).");
  return openPgliteDir(e.PGLITE_DIR);
}

/** Process-wide singleton (survives Next.js dev hot reloads and warm serverless invocations). */
export function getDb(): DB {
  if (!g.__newsdeskDb) g.__newsdeskDb = openFromEnv();
  return g.__newsdeskDb.db;
}

export function dbKind(): Handle["kind"] {
  getDb();
  return g.__newsdeskDb!.kind;
}

/** Test hook: make `getDb()` return the given database. */
export function setDb(handle: Handle) {
  g.__newsdeskDb = handle;
}

/** Close the shared connection (CLI scripts must call this so the process can exit). */
export async function closeDb() {
  const h = g.__newsdeskDb;
  g.__newsdeskDb = undefined;
  await h?.close();
}

/** First row of a query, or undefined. */
export async function first<T>(query: PromiseLike<T[]>): Promise<T | undefined> {
  return (await query)[0];
}

export { schema };
