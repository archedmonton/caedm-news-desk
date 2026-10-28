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

## 1. Supabase

1. Create the project in **Canada (Central)**, with a generated database password stored in a password
   manager.
2. In **Project Settings → Data API**, disable the Data API (the app connects to Postgres directly). The
   migration also enables Row Level Security on every table as a second guard.
3. Under **Connect**, copy:
   - the **Transaction pooler** string (port **6543**), which becomes `DATABASE_URL` for Vercel;
   - the **Session pooler** (or Direct) string (port **5432**), which becomes `DATABASE_URL_DIRECT` for
     migrations.
4. Create the tables. Run this once from your PC, passing the strings only for that one command; don't
   save them in `.env`, or local development would use the production database.

   ```powershell
   $env:DATABASE_URL="<transaction pooler string>"; $env:DATABASE_URL_DIRECT="<session pooler string>"; $env:NODE_ENV="production"
   npm run db:setup          # migrations + source registry + developer admin (invited)
   Remove-Item Env:DATABASE_URL, Env:DATABASE_URL_DIRECT, Env:NODE_ENV
   ```

   Re-run `npm run db:migrate` the same way whenever a release adds a migration (see `drizzle/`).

## 2. Vercel

1. **Import** `archedmonton/caedm-news-desk`. Framework: Next.js; leave the build settings at their
   defaults.
2. Add **Environment Variables** (Production):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Supabase **transaction pooler** string (6543) |
   | `DATABASE_POOL_MAX` | `3` |
   | `APP_URL` | `https://<project>.vercel.app` (or the custom domain) |
   | `CRON_SECRET` | random 32+ chars: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
   | `ALLOWED_EMAIL_DOMAIN` | `caedm.ca` |
   | `DEVELOPER_NAME` / `DEVELOPER_EMAIL` | `Ruban Peppin` / `ruban.peppin@caedm.ca` |
   | `EMAIL_TRANSPORT` | `outbox` until IT provides email, then `smtp` or `graph` |
   | `EMAIL_LIVE_SEND` | `false` until email is configured, then `true` |
   | `EMAIL_FROM` | `CAEDM News Desk <newsdesk@caedm.ca>` |
   | `PRODUCTION_ACCESS_ENABLED` | `false` until email works, then `true` |
   | SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | from IT |
   | or Graph: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_SENDER` | from IT |

   Don't set `DEV_LOGIN_ENABLED`; it is ignored in production anyway. The `NEXT_PUBLIC_SUPABASE_*` keys
   are not used by this app.
3. **Settings → Functions → Region:** Washington, D.C. (`iad1`), the closest to Supabase Canada Central.
4. **Deploy.** Then check:
   - `https://<app>/api/health` returns `{"ok":true,"db":"ok",…}`.
   - **Settings → Cron Jobs** lists the two `/api/cron/tick` jobs. Use **Run** on one to collect news
     immediately; the response shows `checked: 4`.

## 3. Email and first sign-in

Sign-in stays disabled in production until real email works, because invitations prove a person controls
their @caedm.ca mailbox.

1. IT provides an SMTP relay account or a Microsoft Graph app registration (`Mail.Send`, restricted to the
   sender mailbox).
2. Set the email variables, `EMAIL_LIVE_SEND=true` and `PRODUCTION_ACCESS_ENABLED=true`, then redeploy.
3. Send the developer's invitation (same one-off variables as in Supabase step 4, plus
   `APP_URL=https://<app>`):

   ```powershell
   npm run admin:invite -- ruban.peppin@caedm.ca admin
   ```

4. Open the emailed link, set a password, and sign in. Invite everyone else from **Settings → Staff access**,
   or approve their **Request access** submissions on the Overview.
5. **Test before going live.** Set the brief recipient to yourself, use **Email outbox → Save preview to
   outbox**, confirm it arrives, then set it back to `communications@caedm.ca`.

## Production readiness checklist

- [ ] Vercel non-profit/in-house use confirmed in writing by Vercel
- [ ] Supabase project in Canada (Central); Data API disabled; DB password in a password manager
- [ ] `npm run db:setup` run against Supabase; `/api/health` OK
- [ ] `CRON_SECRET` set; both cron jobs visible; a manual run returns `checked: 4`
- [ ] IT email transport configured; test brief received; `PRODUCTION_ACCESS_ENABLED=true`
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
