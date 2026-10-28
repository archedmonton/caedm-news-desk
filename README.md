# CAEDM News Desk

News intelligence and communications monitoring for the **Catholic Archdiocese of Edmonton**.

It monitors approved Catholic and Edmonton news sources and prioritizes stories with an explainable P0–P3
engine. It also prepares a 7:30 AM (America/Edmonton) morning brief, sends high-priority alerts, and tracks
Communications follow-ups.

Everything is open source and free to run: Next.js 15, SQLite, a Node worker, and no paid APIs. **Live email
is disabled by default.** Every message goes to a local outbox until IT configures an approved transport.

## Quick start (Windows, local development)

Requires Node.js 22.12+ (developed on Node 24).

```powershell
npm install
copy .env.example .env.local      # defaults are safe for local development
npm run db:setup                  # create SQLite DB, seed sources + two dev accounts
npm run collect                   # fetch live news from the 4 pilot sources now (~30 s)
npm run dev:all                   # web app + background worker
```

Open **http://localhost:3000**. In the development sign-in panel, choose **Dev Administrator** or **Dev
Communications**.

| Command | Purpose |
|---|---|
| `npm run dev` | Web app only (http://localhost:3000) |
| `npm run worker` | Background worker: source checks, alerts, 7:30 brief, delivery retries (every 60 s) |
| `npm run dev:all` | Both of the above |
| `npm run db:setup` | Apply migrations + seed source registry and dev users (idempotent) |
| `npm run db:seed:sample` | Same, plus clearly labelled `[Sample]` stories (example.org links) |
| `npm run collect [-- slug]` | Check all enabled sources now (or one, e.g. `vatican-news`) |
| `npm run digest:preview` | Render the morning brief to `data/previews/*.html` (sends and records nothing) |
| `npm run alerts:dry-run` | Show which stories would be alerted right now and why others are held |
| `npm run admin:invite -- name@caedm.ca admin` | Operator bootstrap of an invitation link |
| `npm run check` | Typecheck + lint + unit/integration tests |
| `npm run test:e2e` | Playwright (desktop and mobile) against an isolated DB on port 3210 |
| `npm run build && npm start` | Production build and server |

## Database

- SQLite file at `DATABASE_PATH` (default `./data/caedm-news-desk.db`), in WAL mode.
- Schema: `src/lib/db/schema.ts`. Migrations are generated with `npm run db:generate` into `drizzle/` and
  applied by `npm run db:migrate` / `db:setup`. The worker also applies them at start.
- All timestamps are UTC epoch milliseconds, displayed and scheduled in America/Edmonton.
- To reset local data, stop the app, delete `data/caedm-news-desk.db*`, then run `npm run db:setup`.

## Testing the main flows

### Source monitoring

- Run `npm run collect` or use **Sources → Check now** (admin).
- Each source shows health, last success, latest article, errors and a check log.
- If one source fails, the others continue; the failing one backs off exponentially (30 min → 6 h max).

### Morning brief

- **Email outbox → Preview today's brief** shows a live render without recording anything. You can also
  run `npm run digest:preview`.
- **Save preview to outbox** stores a `[PREVIEW]` copy. It doesn't consume stories from the real brief.
- The worker creates the real brief once per Edmonton day at or after the configured time (default 07:30),
  with up to 4 h catch-up. The unique key `digest:YYYY-MM-DD` prevents duplicates across restarts.

### High-priority alerts

- **Email outbox → Alert dry run** shows eligible and held stories. You can also run
  `npm run alerts:dry-run`.
- **Run alert check now** creates a simulated alert. Running it again creates nothing, because each story
  is alerted only once.
- To test with live data, open a recent story, change its priority to P1 with a reason, then run the alert
  check. Manual overrides make a story eligible.
- With sample data (`npm run db:seed:sample`), the sample P0 and P1 items generate an alert immediately.
  The sample allegation story shows the **Internal review – unverified** labelling.

## Documentation

| Document | Covers |
|---|---|
| [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md) | Requirements |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Design, data model, priority engine, security |
| [docs/SOURCES.md](docs/SOURCES.md) | Real connector results, limitations, expansion registry |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | IT requirements, deployment, production checklist |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones and future phases |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Implementation status, test results, known limitations |
