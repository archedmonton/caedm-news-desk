import "./_bootstrap";
import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db/client";
import { runMigrations } from "../src/lib/db/migrate";
import { seedSampleData } from "../src/lib/db/sample";
import { ensureDeveloperAdmin, seedSources } from "../src/lib/db/seed";
import { users } from "../src/lib/db/schema";
import { env, isProduction } from "../src/lib/env";

const args = new Set(process.argv.slice(2));
const db = getDb();
runMigrations(db);
console.log(`✓ Migrations applied to ${env().DATABASE_PATH}`);

if (!args.has("--migrate-only")) {
  console.log(`✓ Sources seeded (${seedSources(db)} new)`);
  const dev = ensureDeveloperAdmin(db);
  console.log(`✓ Developer administrator ${env().DEVELOPER_EMAIL} (${dev.status}${dev.created ? ", created" : ""})`);
  if (dev.status === "invited") console.log(`  → Send the developer a sign-up link: npm run admin:invite -- ${env().DEVELOPER_EMAIL} admin`);

  if (!isProduction()) {
    // Development accounts have no password; they are usable only via development sign-in (DEV_LOGIN_ENABLED).
    const devUsers = [
      { email: `dev.admin@${env().ALLOWED_EMAIL_DOMAIN}`, name: "Dev Administrator", role: "admin" as const },
      { email: `dev.manager@${env().ALLOWED_EMAIL_DOMAIN}`, name: "Dev Manager", role: "manager" as const },
      { email: `dev.member@${env().ALLOWED_EMAIL_DOMAIN}`, name: "Dev Member", role: "member" as const },
      { email: `dev.viewer@${env().ALLOWED_EMAIL_DOMAIN}`, name: "Dev Viewer", role: "viewer" as const },
    ];
    for (const u of devUsers) {
      if (!db.select().from(users).where(eq(users.email, u.email)).get()) {
        db.insert(users).values({ ...u, status: "active" }).run();
        console.log(`✓ Dev user ${u.email} (${u.role})`);
      }
    }
    if (args.has("--sample")) console.log(`✓ Sample stories inserted: ${seedSampleData(db)}`);
  } else if (args.has("--sample")) {
    console.error("✗ Refusing to insert sample data in production.");
    process.exit(1);
  }
}
