import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "../env";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema>;

const globalForDb = globalThis as unknown as { __newsdeskDb?: { db: DB; sqlite: Database.Database; file: string } };

export function openDatabase(file: string) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

/** Process-wide singleton (survives Next.js dev hot reloads). */
export function getDb(): DB {
  const file = env().DATABASE_PATH;
  if (!globalForDb.__newsdeskDb || globalForDb.__newsdeskDb.file !== file) {
    const { db, sqlite } = openDatabase(file);
    globalForDb.__newsdeskDb = { db, sqlite, file };
  }
  return globalForDb.__newsdeskDb.db;
}

/** Test hook: inject a database (e.g. in-memory). */
export function setDb(db: DB, sqlite: Database.Database) {
  globalForDb.__newsdeskDb = { db, sqlite, file: env().DATABASE_PATH };
}

export { schema };
