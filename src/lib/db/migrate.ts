import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import type { DB } from "./client";

export function runMigrations(db: DB) {
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
}
