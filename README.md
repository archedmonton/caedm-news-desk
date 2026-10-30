# CAEDM News Desk

News intelligence and communications monitoring for the **Catholic Archdiocese of Edmonton**.

News Desk monitors approved Catholic and Edmonton news sources and prioritizes stories with an explainable
P0–P3 engine. It emails a **morning brief around 8:00 AM** (America/Edmonton), keeps the dashboard **up to
date in real time while staff are signed in**, and tracks Communications follow-ups. Administrators manage
staff and **news sources** in the app.

The stack is Next.js 15, Postgres (Supabase in production; embedded PGlite locally) and Vercel, with no paid
APIs. **Live email is disabled by default.** Every message goes to an in-app outbox until IT configures an
approved transport.

Help & support: **Ruban Peppin**, ruban.peppin@caedm.ca. Use **Help** on the login screen or the
dashboard, or **Request a feature** inside the app.

## Quick start (Windows, local development)

Requires Node.js 22.12+ (developed on Node 24). There is no database to install: local development uses an
embedded Postgres stored in `./data/pglite`.

```powershell
npm install
copy .env.example .env.local      # defaults are safe for local development
npm run db:setup                  # create tables, seed sources, developer admin and dev accounts
npm run collect                   # fetch live news from the 4 pilot sources now (~30 s)
npm run dev                       # http://localhost:3000
```

In the development sign-in panel, choose **Ruban Peppin** (developer admin), **Dev Administrator**, **Dev
Manager**, **Dev Member** or **Dev Viewer**. While you're signed in, sources refresh automatically when
they're due.

> The embedded database is single-process. Stop `npm run dev` before running `db:setup`, `collect` or the
> other CLI scripts (they say so if you forget).

| Command | Purpose |
|---|---|
| `npm run dev` | Web app (http://localhost:3000) |
| `npm run db:setup` | Apply migrations; seed source registry, developer admin and dev accounts (idempotent; never overwrites admin edits) |
| `npm run db:seed:sample` | Same, plus clearly labelled `[Sample]` stories (example.org links) |
| `npm run db:migrate` | Migrations only (use with Supabase connection strings; see docs/DEPLOYMENT.md) |
| `npm run collect [-- slug]` | Check all enabled sources now (or one, e.g. `vatican-news`) |
| `npm run digest:preview` | Render the morning brief to `data/previews/*.html` (sends and records nothing) |
| `npm run alerts:dry-run` | Show which stories would be alerted now and why others are held |
| `npm run admin:invite -- name@caedm.ca [admin\|manager\|member]` | Operator bootstrap of an invitation |
| `npm run worker` | Optional, for self-hosting only: refresh loop (Vercel uses Cron + live refresh instead) |
| `npm run check` | Typecheck + lint + unit/integration tests (in-memory Postgres) |
| `npm run test:e2e` | Playwright (desktop and mobile) on an isolated database and a local fixture website |
| `npm run build && npm start` | Production build and server |

## How refreshing works

- **Every morning:** Vercel Cron calls `/api/cron/tick` during the 8 AM hour (Edmonton). That run checks
  every source, sends qualifying P0/P1 alerts, and emails the morning brief, once per day.
- **While signed in:** the dashboard polls `/api/live` every minute. When sources are due (every 15 minutes
  by default; **Settings → Monitoring**), the server refreshes them in the background and shows a
  **"N new stories · Show"** banner.
- Only one refresh runs at a time (a database lease), and every step is idempotent.

## Managing sources (administrators)

Go to **Sources → Add source**:
1. Enter the website.
2. **Find feed** reads the RSS/Atom feed the site advertises.
3. **Test** shows its latest headlines.
4. **Add source**.

**Edit** changes a source's name, address, importance and area, or turns monitoring on or off. Planned
sources in the *Expansion registry* have a **Set up** button. Sources that already have stories can be
disabled but not deleted.

## Testing the main flows

- **Morning brief:** **Email outbox → Preview today's brief** (live render, records nothing) or **Save
  preview to outbox** (sends only to you).
- **Alerts:** **Email outbox → Alert dry run**, or **Run alert check now** ([admin|manager|member]s and admins).
- **Access requests:** use **Request access** on the login page; admins see the request on the Overview.
- **Live updates:** keep the dashboard open while a colleague submits a link; the banner appears within a
  minute.

## Documentation

| Document | Covers |
|---|---|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel + Supabase setup, environment variables, production checklist |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Design, data model, priority engine, scheduling, security |
| [docs/SOURCES.md](docs/SOURCES.md) | Source connector results and adding sources |
| [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md) | Requirements and change requests |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones and future phases |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Status, test results, known limitations |
