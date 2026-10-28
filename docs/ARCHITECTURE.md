# CAEDM News Desk — Architecture

## 1. Overview

```
                    ┌────────────────────────────────────────────────┐
  Staff browser ───▶│ Next.js 15 (App Router, server components,     │
                    │ server actions)  — dashboard + auth            │
                    └───────────────┬────────────────────────────────┘
                                    │ shared library code (src/lib)
                    ┌───────────────▼────────────────────────────────┐
                    │ SQLite (WAL) via Drizzle ORM — data/*.db       │
                    └───────────────▲────────────────────────────────┘
                                    │
                    ┌───────────────┴────────────────────────────────┐
                    │ Worker (Node.js, `npm run worker`)             │
                    │  every 60 s: due source checks → classify →    │
                    │  alerts → digest (07:30 Edmonton) → retries    │
                    └───────┬───────────────────────────┬────────────┘
                            │ safe HTTP fetch            │ mail transport
                 RSS feeds / newsroom HTML        outbox (default) | SMTP | Graph
```

There are two processes, one database and one codebase. Neither needs a queue, Redis or another external
service.

## 2. Key decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | Next.js 15 App Router, React 19 | Requested; server components keep DB access server-side. |
| DB | SQLite (better-sqlite3, WAL) + Drizzle ORM/Kit | Zero cost, single file, easy backup; Drizzle migrations are SQL files in `drizzle/`. |
| Background work | Separate Node worker run with `tsx`, 60 s tick loop | Survives web restarts; tick + DB "claim" rows make jobs idempotent. No external queue. |
| Scheduling | Tick loop compares the current America/Edmonton wall-clock time to the configured `HH:MM` | DST-safe: we never compute fixed UTC offsets; "has today's digest been claimed?" is a unique key `digest:YYYY-MM-DD` (Edmonton date). |
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
worker/index.ts                    background worker entry
scripts/                           CLI: collect, digest preview, alert dry-run, invite admin
drizzle/                           generated SQL migrations
tests/unit, tests/e2e              Vitest and Playwright
```

## 4. Data model (summary)

All timestamps are stored as UTC epoch milliseconds (`integer`), and converted to Edmonton time only for
display and scheduling.

- `users`: email (unique), name, role (`admin` | `communications`), status (`invited` | `active` |
  `disabled`), password hash, lockout counters.
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
- `notifications`: kind (`digest` | `alert` | `invite` | `test`), **unique `dedupe_key`**, recipient, subject,
  html/text, status (`pending` | `simulated` | `sent` | `failed` | `skipped`), attempts, next attempt, error.
- `notification_stories`: which stories went out in which notification. Used by digest/alert dedupe.
- `source_check_logs`: one row per check with counts, HTTP status, duration, error.
- `audit_logs`: user, action, entity, JSON details.
- `application_settings`: key → JSON value.

## 5. Ingestion pipeline

1. **Due check.** The worker selects enabled, verified sources where `next_check_at <= now`.
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
  - The worker computes the Edmonton date and time each tick.
  - If time ≥ the scheduled time (default 07:30) and within a 4 h catch-up window, it inserts a
    `notifications` row with `dedupe_key = digest:<date>`. The unique constraint makes the claim atomic, so a
    second worker or a restart gets a conflict and does nothing.
  - Content is non-archived stories detected since the last delivered digest (fallback lookback 24 h,
    max 72 h) that were never included in an earlier digest.
  - Each story goes into exactly one section.
  - An empty digest renders a "No new stories" state.
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

## 9. Deployment (future, with IT approval)

A single Windows or Linux VM with Node 24 LTS:

- `npm ci && npm run build && npm run db:migrate`.
- Run `npm start` (web) and `npm run worker` as two services (NSSM / Windows Service, or systemd), behind
  IIS/nginx with TLS.
- Back up the `data/` SQLite file nightly (`sqlite3 .backup`).
- Mail: approved SMTP relay or a Graph app registration with `Mail.Send` scoped to one mailbox. See
  [DEPLOYMENT.md](DEPLOYMENT.md).
