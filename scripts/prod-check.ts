import { describeError } from "./_bootstrap";
import { sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import { closeDb, getDb, openPostgres } from "../src/lib/db/client";
import { env } from "../src/lib/env";

// Read-only reachability check for production settings: one SELECT per database URL and an SMTP login.
// Never sends email. Run from a network outside the CAEDM firewall to see what Vercel will see.
async function check(label: string, fn: () => Promise<string | void>) {
  try {
    const note = await fn();
    console.log(`✓ ${label}${note ? `: ${note}` : ""}`);
    return true;
  } catch (err) {
    console.error(`✗ ${label}: ${describeError(err)}`);
    return false;
  }
}

async function main() {
  const e = env();
  const results: boolean[] = [];

  results.push(
    await check("Database (DATABASE_URL, transaction pooler)", async () => {
      if (!e.DATABASE_URL) throw new Error("DATABASE_URL is not set");
      const rows = (await getDb().execute(sql`select count(*)::int as n from information_schema.tables where table_name = 'users'`)) as unknown as {
        n: number;
      }[];
      return rows[0]?.n ? "connected, tables exist" : "connected, but tables are missing: run npm run db:setup:prod";
    }),
  );

  if (e.DATABASE_URL_DIRECT) {
    results.push(
      await check("Database (DATABASE_URL_DIRECT, session pooler)", async () => {
        const h = openPostgres(e.DATABASE_URL_DIRECT!, { max: 1 });
        try {
          await h.db.execute(sql`select 1`);
        } finally {
          await h.close();
        }
      }),
    );
  }

  if (e.EMAIL_TRANSPORT === "smtp") {
    results.push(
      await check(`SMTP login (${e.SMTP_HOST}:${e.SMTP_PORT ?? 587})`, async () => {
        const t = nodemailer.createTransport({
          host: e.SMTP_HOST,
          port: e.SMTP_PORT ?? 587,
          secure: e.SMTP_SECURE,
          auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
          connectionTimeout: 15_000,
          greetingTimeout: 15_000,
        });
        await t.verify();
        t.close();
        return "reachable and accepted the login (no email sent)";
      }),
    );
  }

  if (results.includes(false)) process.exitCode = 1;
}

main().finally(closeDb);
