# CAEDM News Desk — Architecture

## 1. Overview

```
 Staff browser ──▶ Next.js 15 on Vercel (App Router, server components, server actions)
   │  polls /api/live every 60 s        │ shared library code (src/lib)
   │                                    ▼
   │                         Postgres via Drizzle ORM
   │                Supabase (production) · PGlite embedded (local dev & tests)
   │                                    ▲
   └── refresh while signed in ─┐       │
 Vercel Cron (≈ 8 AM Edmonton) ─┴──▶ runTick (one at a time, DB lease):
                                     due source checks → classify → alerts → 8 AM brief → email retries
                                       │ safe HTTP fetch            │ mail transport
                              RSS feeds / newsroom HTML      outbox (default) | SMTP | Graph
```

There is one codebase and one database, with no always-on process and no queue. `npm run worker` remains
available for self-hosting and calls the same `runTick`.

## 2. Key decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | Next.js 15 App Router, React 19 | Requested; server components keep DB access server-side. |
| DB | Postgres + Drizzle ORM/Kit: Supabase via postgres-js (`prepare: false` for the transaction pooler) in production; PGlite (Postgres compiled to WASM) for local dev and tests | Same SQL dialect everywhere; no local install; free tiers. Migrations are SQL files in `drizzle/`, and RLS is enabled on every table. |
| Scheduling | `runTick` called by Vercel Cron (14:00 and 15:00 UTC, which is the 8 AM hour in both MDT and MST) and by `/api/live` (background, via `after()`) when sources are due | Fits Vercel Hobby (daily crons only); "real-time" while staff are working. An atomic DB lease prevents overlapping refreshes across serverless instances. |
| Brief timing | `runScheduledDigest` compares Edmonton wall-clock time to the configured `HH:MM` (default 08:00) | DST-safe, never fixed UTC offsets. `digest:YYYY-MM-DD` (Edmonton date) is a unique key, so it is sent at most once a day. |
| Timezone | Pure `Intl` helpers in `src/lib/time.ts` | No tz-data dependency; tested across DST transitions. |
| Feeds | `rss-parser` on text we fetched ourselves | Parsing is separated from fetching so all network access goes through the safe fetcher. |
| HTML | Cheerio on publisher listing pages only | Used only where no feed exists, robots.txt allows it, and only headline / date / publisher-supplied lede are read. |
| Classification | Deterministic weighted rules (`src/lib/priority`) | Explainable, testable, free. Keyword lists are configurable in Settings. |
| Email | Transport interface: `outbox` (default), `smtp` (nodemailer), `graph` (Microsoft Graph REST) | Live sending requires `EMAIL_LIVE_SEND=true` **and** a configured transport; otherwise messages are stored as `simulated`. |
| Auth | Invitation + password (scrypt), DB sessions, HttpOnly cookies | No paid auth. Invitations prove mailbox ownership once mail transport exists. |
| UI | Tailwind v4 + local shadcn/ui-style components + Lucide | Components are copied into `src/components/ui`, the same model as shadcn, so there is no runtime UI framework lock-in. |

## 3. Code layout

```
src/
  app/
    login/, invite/[token]/        public auth pages
    (app)/                         authenticated shell (sidebar nav)
      page.tsx                     Overview
      news/, news/[id]/            News Feed + article detail
      follow-ups/                  Follow-up board
      sources/                     Source health + admin toggles
      settings/                    Settings, staff access
      outbox/, outbox/[id]/        Email preview / simulated delivery history
  actions/                         Server actions (authz checked in every action)
  components/ui/                   Button, Badge, Card, Input, …
  components/                      App-specific components
  lib/
    db/        schema.ts, client.ts, migrate.ts, seed.ts
    auth/      password.ts, session.ts, permissions.ts, access.ts
    ingest/    safe-fetch.ts, url.ts, robots.ts, registry.ts, adapters/*, collector.ts
    priority/  rules.ts, classify.ts
    notify/    templates/*, transport/*, digest.ts, alerts.ts, deliver.ts
    settings.ts, audit.ts, time.ts, env.ts
worker/index.ts                    optional self-hosting loop (calls runTick)
src/lib/tick.ts                    the refresh routine + lease
src/lib/sources-admin.ts           feed discovery, testing, create/update/delete for admins
app/api/cron/tick, app/api/live    scheduler entry point (CRON_SECRET) and live updates (session)
scripts/                           CLI: collect, digest preview, alert dry-run, invite admin
drizzle/                           generated SQL migrations
tests/unit, tests/e2e              Vitest and Playwright
```

## 4. Data model (summary)

All timestamps are stored as UTC epoch milliseconds (`integer`), and converted to Edmonton time only for
display and scheduling.

- `users`: email (unique), name, role (`admin` | `manager` | `member` | `viewer`), status (`invited` | `active` |
  `disabled`), password hash, lockout counters, `is_developer`, and personal notification preferences
  (`notify_digest`, `notify_alerts` = all/p0/none, `notify_assignments`, `notify_access_requests`), and the
  personal brief schedule (`digest_time` HH:MM or null for the team time, `digest_days` = daily/weekdays,
  `digest_scope` = catholic/all).
- `access_requests`: public "request access" submissions (name, work email, department, requested role,
  reason, status, reviewer, granted role).
- `feature_requests`: staff requests emailed to the developer (title, details, type, importance, status).
- `invitations`: email, role, sha256(token) (unique), expiry, accepted time.
- `sessions`: sha256(token) (unique), user, expiry, last seen.
- `sources`: slug (unique), name, site URL, feed/listing URL, method (`rss` | `html` | `manual`), adapter, type,
  region, importance, `verified`, `enabled`, interval, health fields (last check / success / article,
  consecutive failures, next check, last error).
- `stories`: canonical URL (unique), URL hash, title, title fingerprint, group key, description and its
  provenance, publisher source, published / first-detected / source-updated times, category, geo relevance,
  priority, score, reason, override flag, verification status, sensitive flag, review status.
- `story_sources`: (story, source) unique. Records every source that reported the same story.
- `story_priority_history`: every system or human priority change.
- `follow_ups`: one per story; assignee, due date, status. `follow_up_notes`: internal notes.
- `notifications`: kind (`digest` = team brief | `brief` = personal brief | `alert` | `invite` | `test` | …), **unique `dedupe_key`**, recipient, subject,
  html/text, status (`pending` | `simulated` | `sent` | `failed` | `skipped`), attempts, next attempt, error.
- `notification_stories`: which stories went out in which notification. Used by digest/alert dedupe.
- `source_check_logs`: one row per check with counts, HTTP status, duration, error.
- `audit_logs`: user, action, entity, JSON details.
- `application_settings`: key → JSON value.

## 5. Ingestion pipeline

1. **Due check.** `runTick` (cron, live refresh, or worker) selects enabled, verified sources where
   `next_check_at <= now` and checks them in parallel (one host per source).
2. **Safe fetch** (`safe-fetch.ts`):
   - http/https only, standard ports only.
   - DNS-resolve and reject private, loopback, link-local, CGNAT and metadata addresses.
   - Each redirect hop is re-validated manually (max 5).
   - 15 s timeout, 2 MB streamed size cap.
   - Identifying User-Agent.
   - Per-host minimum spacing.
3. **robots.txt** is fetched (cached 24 h) and checked for the path. Disallowed → the check fails safely.
4. **Adapter** turns the response into `RawItem { title, url, publishedAt?, updatedAt?, description?,
   categories? }`. Adapters are pure functions of text input, so they're tested against fixtures.
5. **Normalize.** Canonical URL (lower-case host, strip `utm_*` / `fbclid` / fragments, sort query), clean
   text, strip HTML from descriptions and truncate them to 400 chars at a sentence or word boundary.
6. **Dedupe.** Unique canonical URL. If the URL exists, add a `story_sources` row and update the
   source-updated time. A title fingerprint (normalized words) gives related-story grouping via `group_key`.
7. **Classify** (§6) and insert.
8. **Record health.**
   - Success resets failures and schedules `now + interval`.
   - Failure increments failures and schedules exponential backoff (`interval × 2^n`, capped at 6 h).
   - The source shows *degraded* after 1 failure and *failing* after 3.
9. **Isolation.** Each source runs in its own try/catch, so one source failing never stops the others.

On a source's first-ever successful check (the baseline), items are stored but marked
`alert_suppressed=true`, so historical backlog never triggers alerts.

## 6. Priority engine

`classifyStory(input, rules, now)` returns `{ priority, score, reasons[], category, geoRelevance, sensitive,
verificationStatus }`.

The score is the sum of the signals below. All keyword lists and thresholds are editable in Settings.

| Signal | Points |
|---|---|
| Source importance (importance × 2) | 0–10 |
| Edmonton-area place or institution in text | +20 |
| Edmonton-based source (no place match) | +12 |
| Alberta | +8 |
| Canada | +6 |
| Archdiocesan reference | +35 |
| Catholic context | +8 |
| Major Church development | +12 |
| Papal reference | +8 |
| Education / healthcare sector | +8 |
| Policy terms | +10 |
| Church-significant policy (separate schools, school choice, MAID, conscience…) | +15 |
| Institutional impact (safety, leadership, closure…) | +10 |
| Urgent headline | +20 |
| Urgent description only | +6 |
| Routine announcement | −10, and capped at P2 |

The publisher's own name is removed before matching. Otherwise "**Edmonton** **Catholic School**s" would
make every ECSD item look local and Church-policy related.

Decision rules, applied in order:

1. **P0** only through explicit rules, never by score:
   - An urgent *headline* term involving the Archdiocese, or a local Catholic institution, within 72 h.
   - A papal transition (death, conclave, sede vacante) from a Catholic source.
2. **P1** needs all of:
   - Score ≥ 45.
   - A *substantive* signal: archdiocesan, policy, Church policy, institutional, urgent headline, or major
     Church development.
   - Local Catholic relevance, or sector plus Church-policy relevance in Canada.

   Importance and topic alone never produce P1.
3. **P3** for routine international news: no papal, major-Church or archdiocesan signal.
4. **P2** if score ≥ 12 and there is any Catholic, sector, policy or local relevance.
5. Otherwise **P3**.
6. Recency caps: older than 7 days → at most P2; older than 30 days → P3.

Verification is separate from priority:

- An item from the organization's own official channel is `official_source`.
- A manual or third-party submission is `unverified`.
- Any item with sensitive terms (abuse, allegation, lawsuit, investigation, death…) is `sensitive=true` and
  labelled **Needs human review**.

Human overrides write `story_priority_history` and set `priority_overridden`, so reclassification never
overwrites them.

## 7. Notifications

- **Digest** (`digest.ts`).
  - Each refresh computes the Edmonton date and time.
  - If time ≥ the scheduled time (default 08:00) and within a 4 h catch-up window, it inserts a
    `notifications` row with `dedupe_key = digest:<date>`. The unique constraint makes the claim atomic, so a
    second worker or a restart gets a conflict and does nothing.
  - Content is non-archived stories detected since the last delivered digest (fallback lookback 24 h,
    max 72 h) that were never included in an earlier digest.
  - Each story goes into exactly one section.
  - An empty digest renders a "No new stories" state.
- **Personal briefs** (`runPersonalBriefs` in `digest.ts`).
  - For each active user with `notify_digest`, each refresh checks their own time and days. It claims
    `brief:<user>:<date>` the same way, with the same 4 h catch-up window.
  - The window starts at that person's previous brief (lookback 24 h, max 72 h). Personal briefs ignore team
    dedupe, so they never take stories away from the team brief.
  - Scope `catholic` keeps sources of type archdiocese, catholic_partner, catholic_national and vatican.
  - Follow-ups are limited to the person's own assignments.
  - A day with nothing new is stored as `skipped` and not emailed.
  - **Send me a brief now** (`sendBriefNow`) uses `brief-now:<user>:<minute>`, which allows one per minute and
    doesn't move the scheduled window.
- **Alerts** (`alerts.ts`).
  - Eligible stories meet all of these:
    - P0 or P1, at or above the configured minimum.
    - Not alert-suppressed.
    - Detected within 6 h and published within 72 h.
    - Never alerted before.
  - Alert hours (default 07:00–21:00) apply; P0 may bypass them (setting). Outside the window, eligible P1
    items wait for the window or the digest.
  - Flood control: everything eligible on one tick is batched into **one** email, with a cap of N alert
    emails per rolling hour and per day. Items over the cap fall through to the digest and are logged as
    `skipped`.
  - Sensitive items go out as **"INTERNAL REVIEW — UNVERIFIED"**, with wording that does not assert the
    claim.
- **Delivery** (`deliver.ts`).
  - The transport is chosen from env. If live send is disabled, the message is stored as `simulated`.
  - Failures retry with backoff (1, 5, 15, 60 min; max 5 attempts) and then stay `failed`, visible in the
    Outbox and on the Overview.

## 8. Security

- **Sessions.**
  - 32-byte random token in an HttpOnly, SameSite=Lax cookie (`Secure` in production); the DB stores only
    the SHA-256.
  - 12 h idle and 7 d absolute expiry.
  - Rotated at login, deleted at logout.
- **Authorization.** `requireUser()` / `requireAdmin()` runs in every server action and page; middleware only
  redirects for UX. Every mutation is audit-logged.
- **Invitations.** Admin only; restricted to `ALLOWED_EMAIL_DOMAIN` (default `caedm.ca`); single-use token,
  72 h expiry. Accepting one proves mailbox control once the invite was delivered by real email. The domain
  check is a gate, not the proof.
- **Passwords.** scrypt (N=16384, r=8, p=1, 64-byte key), min 12 chars; account lockout after 5 failures for
  15 min.
- **Production access gate.** When `NODE_ENV=production`, sign-in and invitations are disabled unless
  `PRODUCTION_ACCESS_ENABLED=true` **and** live email transport is configured. The first admin is
  bootstrapped from the server shell (`npm run admin:invite`), which needs operator access.
- **Dev sign-in.** Only when `NODE_ENV !== 'production'` **and** `DEV_LOGIN_ENABLED=true`, enforced
  server-side. It can never activate in a production build.
- **Response hardening.**
  - Security headers are set in `next.config.ts`.
  - Email HTML previews render in a sandboxed iframe, and all user and publisher text is HTML-escaped in
    templates.
  - All outbound fetches go through the SSRF-safe fetcher.
- **Secrets** only via env (`.env.local`); `.env*` is git-ignored except `.env.example`.

## 9. Roles, accounts and support (change request 2026-10-28)

| Role | Can |
|---|---|
| Administrator | Everything: staff (only admins add people), sources, settings, system health |
| Manager | Member rights plus priority overrides, brief/alert tools, on-demand source checks |
| Member | Review stories, follow-ups and notes, submit links |
| Viewer | Read-only |

- **Developer administrator.** `DEVELOPER_EMAIL` (default `ruban.peppin@caedm.ca`) is seeded as a protected
  admin with `is_developer=1`. Other admins can't demote or disable it.
  - Development: active, usable through dev sign-in.
  - Production: invited; bootstrap with `npm run admin:invite`.
- **Work-email sign-in.** The sign-in form only accepts `@ALLOWED_EMAIL_DOMAIN` addresses, checked both in
  the browser and on the server.
- **Request access.** A public form on the login page.
  - Spam controls: honeypot field, 20 requests/hour cap, one pending request per email.
  - It returns the same reply whether or not an account exists, so it can't be used to discover accounts.
  - Requests appear on the admin Overview, with a badge in the sidebar, and are emailed to admins who opted in.
  - Approval issues a normal single-use invitation with the role the admin picks.
- **Personal notifications.**
  - The team brief goes only to the team mailbox. Opted-in users get their own personal brief instead.
  - Alerts go to the team mailbox plus each user who opted in. "P0 only" users are added only when the alert
    contains a P0 story.
  - Assignees get an email when someone else assigns them a follow-up.
  - Brief previews go only to the person who requested them.
- **Contextual help.** One help panel per page tree (`HelpProvider`), opened from the login page, page
  headers and the sidebar. Its content depends on the current page, and it shows the developer contact.
  - `HelpHint` is a small "?" beside a feature. It opens the panel with that topic first and highlighted.
  - `/guide` renders `docs/USER-GUIDE.md`, bundled as text by a webpack rule, with `src/lib/markdown.tsx`. The
    guide therefore has one source.
- **Feature requests.**
  - Stored, then emailed to `DEVELOPER_EMAIL` with Reply-To set to the requester (simulated until live
    email is enabled).
  - Capped at 10 per user per day.
  - Administrators track their status in Settings.

## 10. Sources managed by administrators

- **Adding a source:**
  1. Enter the organization's website. **Find feed** reads only the feeds the site advertises
     (`<link rel="alternate">`); we never guess endpoints.
  2. **Test** fetches the feed exactly as monitoring does (SSRF guard, robots.txt) and shows its latest
     headlines.
  3. Saving re-tests the feed and records `verified_by` and `verified_at`.
- **Adapters:** new sources always use the generic RSS/Atom adapter. Newsroom-page readers (ECSD, Covenant,
  Alberta) are code-reviewed adapters; admins can edit those sources, and a changed address is re-tested
  with the same adapter.
- **Seeding:** `seedSources` only inserts missing registry entries, so admin edits are never overwritten.
- **Deleting:** sources that have stories can't be deleted, only disabled, to keep their history.

## 11. Deployment

Vercel + Supabase. See [DEPLOYMENT.md](DEPLOYMENT.md) for the step-by-step guide, environment variables and
checklist.
