# Deployment: Vercel + Supabase

```
Staff browser ──HTTPS──▶ Vercel (Next.js, region iad1) ──Postgres (pooler :6543)──▶ Supabase (Canada Central)
                              ▲              │
       Vercel Cron, daily ────┘              └── approved SMTP relay or Microsoft Graph (email)
       14:00 + 15:00 UTC (≈ 8 AM Edmonton, MDT/MST)
```

## How scheduling works

There is no always-on worker on Vercel. News Desk refreshes in two ways, and both call the same
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

Notes:
- **Brief time:** with Vercel Hobby the scheduled run is fixed to the 8 AM hour. Another time in Settings
  only takes effect at the next refresh after that time. For an exact minute, have any external scheduler
  (e.g. Supabase `pg_cron` + `pg_net`) call `/api/cron/tick` with the same `Authorization: Bearer
  <CRON_SECRET>` header.
- **Alerts:** P0/P1 email alerts go out after the 8 AM run and whenever a signed-in session triggers a
  refresh. They are not sent every few minutes overnight.

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

Run this from your PC, on the office network:

```powershell
npm run admin:invite:prod -- ruban.peppin@caedm.ca
```

It creates your invitation in the Supabase database. It also prints the one-time link and emails it to you
through the CAEDM SMTP server. Open the link, set a password and sign in. You can change it later under
**My account → Password**.

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

## Production readiness checklist

- [ ] Vercel non-profit/in-house use confirmed in writing by Vercel
- [ ] Supabase project in Canada (Central); Data API disabled; DB password in a password manager
- [ ] Supabase strings in `.env.vercel`, imported to Vercel (Production only), redeployed, `/api/health` OK
- [ ] `CRON_SECRET` set; both cron jobs visible; a manual run returns `checked: 4`
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
