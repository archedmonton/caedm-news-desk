# Deployment: Vercel + Supabase

```
Staff browser ──HTTPS──▶ Vercel (Next.js, region iad1) ──Postgres (pooler :6543)──▶ Supabase (Canada Central)
                              ▲  ▲           │                                          │
       Vercel Cron, daily ────┘  └───────────┼───── Supabase pg_cron, every 15 min ─────┘
       14:00 + 15:00 UTC (≈ 8 AM Edmonton)   └── approved SMTP relay or Microsoft Graph (email)
```

## How scheduling works

There is no always-on worker on Vercel. News Desk refreshes in three ways, and all call the same
idempotent routine (`runTick`). A database lease lets only one refresh run at a time.

1. **Daily, around 8:00 AM Edmonton: Vercel Cron.**
   - `vercel.json` calls `/api/cron/tick` at 14:00 UTC and 15:00 UTC. Hobby crons fire somewhere within
     that hour.
   - In summer (MDT) the 14:00 UTC call lands at 8:xx local; in winter (MST) the 15:00 UTC call does.
   - Each run checks all sources, sends qualifying alerts, then sends the morning brief. The brief is sent at
     most once per Edmonton day, so the "extra" call does nothing.
2. **While anyone is signed in: live refresh.**
   - The dashboard asks `/api/live` once a minute.
   - When sources are due (default every 15 minutes, configurable in Settings), the server refreshes them in
     the background.
   - New stories appear as a "N new stories · Show" banner.
3. **Every 15 minutes: Supabase `pg_cron` (step 4 below).**
   - Personal briefs go out at each person's own time, so something has to refresh through the day. Vercel's
     free plan allows only daily crons.
   - Supabase's free `pg_cron` and `pg_net` extensions call `/api/cron/tick` with the cron secret, which is
     kept in Supabase Vault.

Notes:
- **Without step 3**, personal briefs only go out when the 8 AM run or a signed-in session happens within 4
  hours of each person's time, and P0/P1 alerts wait for the next refresh.
- **Briefs:** the team brief and each personal brief are sent at most once per Edmonton day (unique
  `dedupe_key`), however many refreshes run.

## 0. The production environment file

All production settings live in `.env.vercel` at the project root. The file is git-ignored, and Next.js never
loads it locally, so it can't leak into a commit or into local development. It contains:
- the SMTP settings from IT;
- a generated `CRON_SECRET`;
- `PRODUCTION_ACCESS_ENABLED=true` and `EMAIL_LIVE_SEND=true`;
- placeholders for the two Supabase strings.

The same file is used to import into Vercel (step 2) and by the `:prod` scripts (step 3).

## 1. Supabase: get DATABASE_URL

1. Open the project at <https://supabase.com/dashboard> (project ref `pyhmshpoprihjrfukwvt`).
2. Click **Connect** in the top bar, then go to **Connection String** and choose type **URI**.
   - **Transaction pooler** (port **6543**) → `DATABASE_URL`
   - **Session pooler** (port **5432**) → `DATABASE_URL_DIRECT`

   Don't use "Direct connection". It is IPv6-only, and Vercel can't reach it.
3. Each string contains `[YOUR-PASSWORD]`. Replace it, including the brackets, with the database password.
   If you don't have it, go to **Project Settings → Database → Reset database password**. If the password
   contains `@ : / ? # [ ] %`, URL-encode it first:
   `node -e "console.log(encodeURIComponent(process.argv[1]))" "<password>"`.
4. Paste both strings into `.env.vercel`, replacing the two placeholder lines.
5. Recommended: in **Project Settings → Data API**, disable the Data API. The app connects to Postgres
   directly, and every table also has Row Level Security enabled.

## 2. Vercel

1. **Project → Settings → Environment Variables → Import .env**, choose `.env.vercel`, and select
   **Production** only. Not Preview: preview builds would otherwise use and migrate the production database.
2. **Settings → Functions → Region:** Washington, D.C. (`iad1`).
3. **Deployments → ⋯ → Redeploy.** The build runs `vercel-build`, which first creates or upgrades the
   tables and seeds the sources and the developer admin (`db-setup --hosted-only`), then builds the app.
   If the database can't be reached, the deploy fails instead of going live broken.
4. Check:
   - `https://caedm-news-desk.vercel.app/api/health` returns `{"ok":true,"db":"ok",…}`.
   - The sign-in page shows the email and password form.
   - **Settings → Cron Jobs** lists the two `/api/cron/tick` jobs. **Run** one to collect news now.

## 3. First sign-in (developer administrator)

The CAEDM office network blocks outbound Postgres ports (5432 and 6543), so from the office use the SQL route:

```powershell
npm run admin:invite:sql -- ruban.peppin@caedm.ca
```

Paste the printed SQL into **Supabase → SQL Editor** and run it, then open the printed one-time link. The SQL
contains only a hash of the link's token. From another network, `npm run admin:invite:prod -- <email>` does
the same directly, and `npm run check:prod` tests the database and SMTP login without sending email.

Set a password with the link and sign in. You can change it later under **My account → Password**.

Invite everyone else from **Settings → Staff access**, or approve **Request access** submissions on the
Overview. Those emails are sent from Vercel, so Vercel must be able to reach the SMTP server.

**SMTP reachability (IT).**
- `s10ex2.network.caedm.ca` resolves publicly to `64.141.20.79`. Vercel connects from changing public IP
  addresses, so port **587** (STARTTLS, authenticated) must accept connections from the internet.
- If IT can't allow that, use Microsoft Graph or an authenticated relay such as Microsoft 365
  (`smtp.office365.com:587`), and update the `SMTP_*` / `GRAPH_*` variables.
- Failed emails show in **Email outbox** with the error and are retried automatically.

**Before going live**, set the brief recipient to yourself, use **Email outbox → Save preview to outbox**,
confirm it arrives, then set it back to `communications@caedm.ca`.

## 4. Scheduler: refresh every 15 minutes

From your PC, in the project folder (no database connection needed):

```powershell
npm run scheduler:sql
```

1. Copy everything from `create extension` to `-- End of SQL.`
2. Open **Supabase → SQL Editor → New query**, paste it and click **Run**. It is safe to run again; it
   replaces the job and the stored secret.
3. Check after 15 minutes: `select * from cron.job_run_details order by start_time desc limit 5;` should show
   `succeeded`. **Vercel → Logs** shows the `/api/cron/tick` calls.
4. To stop it: `select cron.unschedule('news-desk-refresh');`

If you change `CRON_SECRET`, update it in Vercel, redeploy, and run the SQL again.

## Production readiness checklist

- [ ] Vercel non-profit/in-house use confirmed in writing by Vercel
- [ ] Supabase project in Canada (Central); Data API disabled; DB password in a password manager
- [ ] Supabase strings in `.env.vercel`, imported to Vercel (Production only), redeployed, `/api/health` OK
- [ ] `CRON_SECRET` set; both cron jobs visible; a manual run returns `checked: 4`
- [ ] Supabase `news-desk-refresh` job created (step 4); `cron.job_run_details` shows `succeeded`
- [ ] IT allows SMTP port 587 from the internet (or provides Graph/M365); test brief received
- [ ] Developer admin signed in; Communications staff invited with the right roles
- [ ] Brief recipient, alert hours and priority rules reviewed by Communications
- [ ] Backups: check what your Supabase plan includes (free plans may not offer downloadable backups) and
      schedule a periodic `pg_dump` for retention.
- [ ] Custom domain (optional): Vercel → Domains, DNS record from IT, update `APP_URL`

## Verified locally in production mode (2026-10-28)

Ran `next start` with `NODE_ENV=production`, the postgres-js driver over a Postgres network connection,
live SMTP to a local mail catcher, and sign-in enabled. **20/20 checks passed**:
- health and security headers
- cron rejecting missing or wrong secrets
- cron with the secret collecting 154 real stories from all 4 sources in ~26 s
- no dev sign-in in production
- invitation email → password → sign-in
- live indicator
- news search
- priority override
- source health
- adding the real CAEDM feed through the UI
- brief preview delivered by SMTP
- feature request emailed to the developer with Reply-To
- public access request reaching the admin dashboard
- mobile layout

## Self-hosting alternative

The same build runs on any server with Node 24 and Postgres:
- `npm ci && npm run build && npm run db:setup`
- run `npm start` as a service
- either run `npm run worker` (refreshes every minute) or call `/api/cron/tick` from the system scheduler
