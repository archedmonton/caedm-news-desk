# Progress

Last updated **2026-10-28**. The local MVP is functionally complete. Production deployment and live email
are blocked on IT approval, as intended.

| Milestone | Status | Verified by |
|---|---|---|
| 1. Foundation | ✅ Done | Next.js 15.5, TS, Tailwind v4, Drizzle and SQLite, migrations, docs, scripts |
| 2. User interface | ✅ Done | Playwright desktop and mobile; screenshots reviewed |
| 3. News collection | ✅ Done | Live run: 154 real stories from 4 sources; integration tests with fixtures |
| 4. Priority engine | ✅ Done | 14 classifier unit tests; real-data distribution reviewed (1 P1, 81 P2, 72 P3) |
| 5. Notifications | ✅ Done (simulated) | Digest, alert, retry and DST integration tests; e2e outbox flow |
| 6. Staff workflow | ✅ Done | Invitation → password → sign-in e2e; roles; audit log; follow-ups |
| 7. Quality and hardening | ✅ Done | See test results below |
| 8. Delivery | ✅ Done | README, SOURCES, DEPLOYMENT (IT requirements and checklist) |

## Test results (final run)

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | ✅ 0 errors |
| ESLint | `npm run lint` | ✅ 0 problems |
| Unit and integration (Vitest) | `npm test` | ✅ 64 passed: time and DST 6, classifier 14, ingest 17, notifications 16, security 11 |
| End-to-end (Playwright) | `npm run test:e2e` | ✅ 10 passed: 9 desktop, 1 mobile (Pixel 7) |
| Production build | `npm run build` | ✅ success |
| Live connectors | `npm run collect` | ✅ ECSD 24, Covenant 20, Vatican 50, Alberta 60 |
| Production gate | `next start` with `NODE_ENV=production` | ✅ sign-in disabled, dev panel absent, forged cookie → /login, security headers present |
| Worker | `npm run worker` | ✅ ticks; checks due sources; heartbeat written |

## Blocked or incomplete (external dependencies)

1. **Live email delivery.** Needs an IT-approved SMTP relay or Graph app registration.
   - The SMTP transport (nodemailer) and Graph transport are implemented but **not tested against a real
     server**, by design.
   - Retry and failure handling is tested with a fake transport.
2. **Production sign-in.** Disabled until `PRODUCTION_ACCESS_ENABLED=true` *and* live email are configured.
   This is intentional, per spec §11.
3. **Production hosting.** Not deployed. See `docs/DEPLOYMENT.md`.

## Known limitations

- Three of the four pilot sources have **no official news feed**, so their adapters read newsroom HTML:
  - A publisher redesign will stop new items. The Sources page shows a warning, and the adapter's selectors
    need updating.
  - Ask ECSD, Covenant Health and the GoA about RSS feeds.
- Covenant and older Alberta items publish **dates only**, not times.
- The Overview shows "0 new stories" on day one: the first sync of each source is a *baseline*. It is
  stored but alert-suppressed, so historical backlog never triggers alerts.
- Related-story grouping uses headline word overlap (Jaccard ≥ 0.6). It's simple and may miss paraphrased
  headlines.
- The classifier is keyword-based. It is explainable and tunable in Settings, but will misjudge some
  stories; staff override where needed.
- "Upcoming events" in the brief lists stories categorized as events. It doesn't extract event dates.
- Email preview links point to `APP_URL`. Set it correctly in production.
- Rate limiting is per account (lockout), not per IP. Add proxy-level rate limiting in production.
- SQLite fits a single server and a small team. Move to Postgres if multi-server hosting is ever needed.
- The CAEDM feed (`caedm.ca/feed/`) is verified but disabled pending owner approval. An admin can enable it
  on Sources.

## Exact next tasks

1. IT: provision the server and TLS, choose SMTP or Graph, issue credentials (see `docs/DEPLOYMENT.md`).
2. Send a test brief to a test mailbox with `EMAIL_LIVE_SEND=true`, then switch the recipient to
   `communications@caedm.ca`.
3. Bootstrap the first admin: `npm run admin:invite -- you@caedm.ca admin`.
4. Communications reviews priority keyword lists, thresholds and alert hours after one or two weeks of real
   data.
5. Enable the CAEDM feed, then verify and activate further expansion sources (see `docs/SOURCES.md`).

## Log

- 2026-10-28:
  - Workspace was empty. Scaffolded Next.js; verified the pilot sources.
  - Implemented all milestones. Tuned the classifier on real data: excluded the publisher's own name from
    matching, required a substantive signal for P1, and made description-only urgency weak.
  - Fixed ECSD JSON-LD parsing (raw newlines inside strings).
  - Stripped feed "Read all" link text from descriptions.
  - Fixed the mobile filter overflow.
  - Stopped React 19 auto-resetting forms after validation errors.
