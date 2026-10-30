import { describeError } from "./_bootstrap";
import { eq } from "drizzle-orm";
import { closeDb, dbKind, getDb, openPostgres, setDb } from "../src/lib/db/client";
import { runMigrations } from "../src/lib/db/migrate";
import { seedSampleData } from "../src/lib/db/sample";
import { ensureDeveloperAdmin, seedSources } from "../src/lib/db/seed";
import { sources, users } from "../src/lib/db/schema";
import { env, isProduction } from "../src/lib/env";

// Usage: npm run db:setup [-- --sample | --migrate-only | --defer-checks | --hosted-only]
// With DATABASE_URL set (Supabase), migrations run over DATABASE_URL_DIRECT (session/direct connection).
async function main() {
  const args = new Set(process.argv.slice(2));
  const e = env();
  if (args.has("--hosted-only") && !e.DATABASE_URL) {
    // Vercel builds without a database (e.g. preview deployments) skip setup instead of creating a throwaway PGlite.
    console.log("DATABASE_URL is not set; skipping database setup.");
    return;
  }
  if (e.DATABASE_URL) setDb(openPostgres(e.DATABASE_URL_DIRECT ?? e.DATABASE_URL, { max: 1 }));
  const db = getDb();
  const target = e.DATABASE_URL ? new URL(e.DATABASE_URL_DIRECT ?? e.DATABASE_URL).host : e.PGLITE_DIR;
  await runMigrations(db, dbKind());
  console.log(`✓ Migrations applied (${dbKind()}: ${target})`);

  if (!args.has("--migrate-only")) {
    console.log(`✓ Sources seeded (${await seedSources(db)} new)`);
    const dev = await ensureDeveloperAdmin(db);
    console.log(`✓ Developer administrator ${e.DEVELOPER_EMAIL} (${dev.status}${dev.created ? ", created" : ""})`);
    if (dev.status === "invited") console.log(`  → Send the developer a sign-up link: npm run admin:invite:prod -- ${e.DEVELOPER_EMAIL}`);

    if (!isProduction() && !e.DATABASE_URL) {
      // Development accounts have no password; they are usable only via development sign-in (DEV_LOGIN_ENABLED).
      const devUsers = [
        { email: `dev.admin@${e.ALLOWED_EMAIL_DOMAIN}`, name: "Dev Administrator", role: "admin" as const },
        { email: `dev.manager@${e.ALLOWED_EMAIL_DOMAIN}`, name: "Dev Manager", role: "manager" as const },
        { email: `dev.member@${e.ALLOWED_EMAIL_DOMAIN}`, name: "Dev Member", role: "member" as const },
        { email: `dev.viewer@${e.ALLOWED_EMAIL_DOMAIN}`, name: "Dev Viewer", role: "viewer" as const },
      ];
      for (const u of devUsers) {
        const exists = (await db.select({ id: users.id }).from(users).where(eq(users.email, u.email))).length;
        if (!exists) {
          await db.insert(users).values({ ...u, status: "active" });
          console.log(`✓ Dev user ${u.email} (${u.role})`);
        }
      }
      if (args.has("--sample")) console.log(`✓ Sample stories inserted: ${await seedSampleData(db)}`);
      if (args.has("--defer-checks")) {
        // Tests: keep the real publisher sources from being fetched by live refresh.
        await db.update(sources).set({ nextCheckAt: Date.now() + 7 * 24 * 3600_000 });
        console.log("✓ Source checks deferred by 7 days");
      }
    } else if (args.has("--sample")) {
      throw new Error("Refusing to insert development accounts or sample data into a hosted database.");
    }
  }
}

main()
  .catch((err) => {
    console.error(`✗ ${describeError(err)}`);
    process.exitCode = 1;
  })
  .finally(closeDb);
