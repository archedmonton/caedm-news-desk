import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import path from "node:path";
import type { DB } from "./client";

const migrationsFolder = () => path.resolve(process.cwd(), "drizzle");

export async function runMigrations(db: DB, kind: "postgres" | "pglite") {
  if (kind === "pglite") await migratePglite(db as unknown as PgliteDatabase, { migrationsFolder: migrationsFolder() });
  else await migratePostgres(db as unknown as PostgresJsDatabase, { migrationsFolder: migrationsFolder() });
}
