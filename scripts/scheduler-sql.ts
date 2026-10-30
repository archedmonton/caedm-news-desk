import "./_bootstrap";
import { env } from "../src/lib/env";

// Prints SQL for the Supabase SQL editor that calls /api/cron/tick every 15 minutes (pg_cron + pg_net, both free).
// Personal briefs need refreshes through the day; Vercel's free plan only runs cron once a day. The secret goes
// into Supabase Vault, not into the job's text.
const e = env();
if (!e.CRON_SECRET) {
  console.error("✗ CRON_SECRET is not set in .env.vercel.");
  process.exit(1);
}
if (!/^https:\/\//.test(e.APP_URL)) {
  console.error(`✗ APP_URL must be the live https address (it is ${e.APP_URL}).`);
  process.exit(1);
}
const secret = e.CRON_SECRET.replace(/'/g, "''");
const url = `${e.APP_URL.replace(/\/$/, "")}/api/cron/tick?slot=scheduler`;

console.log(`-- Paste everything below into Supabase > SQL Editor and click Run. Safe to run again.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store (or replace) the cron secret in Vault.
select vault.update_secret(id, '${secret}') from vault.secrets where name = 'news_desk_cron_secret';
select vault.create_secret('${secret}', 'news_desk_cron_secret')
where not exists (select 1 from vault.secrets where name = 'news_desk_cron_secret');

-- Every 15 minutes, ask News Desk to refresh. cron.schedule replaces a job with the same name.
select cron.schedule(
  'news-desk-refresh',
  '*/15 * * * *',
  $job$
  select net.http_get(
    url := '${url}',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'news_desk_cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $job$
);
-- End of SQL.

To check it later:   select * from cron.job_run_details order by start_time desc limit 5;
To stop it:          select cron.unschedule('news-desk-refresh');`);
