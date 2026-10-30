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

## Change request 2026-10-30 (2): three roles, promote/delete staff, personal invitations (✅ pushed)

- **Roles:** Viewer removed; Administrator, Manager and Member remain. Migration `0002_remove_viewer_role` is
  data-only and turns existing viewers into members.
- **Promote and demote:** administrators can promote anyone (including to Administrator) and demote other
  administrators, but can never change their own role. Changes are audited with the old and new role.
- **Delete account:** Settings → Staff access → **Delete** (or **Cancel invite**), with a second click to confirm.
  - It is never available for yourself or the developer account.
  - Follow-ups become unassigned; notes, priority history and audit entries are kept, and audit entries keep the
    person's email.
  - Open invitation links are revoked, and the address can be invited again.
- **Invitations:**
  - The form now asks for the person's full name.
  - The email is CAEDM-branded, with the logo, a greeting by name, their role and what it allows, step-by-step
    instructions, an **Accept invitation and create password** button, a fallback link, the expiry and a support
    contact.
  - The sign-up page greets them by name, pre-fills it and shows their role.
  - Approved access requests use the requester's name.
- **All emails** now show the CAEDM logo above the header. Account emails (invitations, security notices) drop the
  news-attribution footer.
- **Verified:** 107 Vitest tests (4 new) and 24 Playwright tests (1 new) pass; typecheck and lint are clean.

## Change request 2026-10-30: personal briefs, Send now, user guide and help icons (✅ pushed 00f0fa5)

- **Personal briefs.** In My account → My news brief, each person chooses:
  - a time (every half hour, 5:00 am to 9:00 pm, or the team time);
  - every day or weekdays only;
  - Catholic news only, or all monitored news.

  Their brief is sent once per day at that time. It covers the news since their previous brief and lists their
  own follow-ups. Quiet days are recorded as skipped and not emailed.
- **Team brief** now goes only to the team mailbox. Previously, opted-in users were added to it; they now get the
  personal brief.
- **Email outbox:**
  - a "Your news brief" card with **Send me a brief now**, which sends the last 24 hours immediately, at most
    once a minute, and reports sent, simulated or failed;
  - a Personal briefs filter;
  - clearer type names.
- **Help:**
  - `HelpHint` "?" icons beside features open Help at that topic;
  - Help links to the full guide;
  - a new **User guide** page renders `docs/USER-GUIDE.md`.
- **Scheduler:** `npm run scheduler:sql` prints Supabase `pg_cron` + `pg_net` SQL (free) that refreshes every
  15 minutes, with the secret in Vault. This is needed for personal times (DEPLOYMENT.md step 4).
- **Office network workarounds:**
  - `npm run admin:invite:sql` creates an invitation via the Supabase SQL editor;
  - `npm run check:prod` tests the database and SMTP login without sending email.
- **Migration:** `0001_personal_briefs` adds three `users` columns. It is additive, with no table rebuild.
- **Verified:** 103 unit/integration tests (15 new) and 23 e2e tests pass; the production build passes.

## 2026-10-30: production bring-up notes

- The CAEDM office network blocks outbound TCP 5432 and 6543 to Supabase (443 works). `db:setup:prod` and
  `admin:invite:prod` time out from the office: run them from another network, or have IT allow those ports.
  Vercel is not affected.
- Supabase connection strings must use the pooler host with user `postgres.<ref>` and a URL-encoded password. The
  "Direct connection" host is IPv6-only.
- CLI scripts now print the driver's underlying cause under Drizzle's "Failed query" message.
- `.env.example` documents the production value for each setting. `.env` stays local-only.

## Change request 2026-10-29 (2): change password (✅ pushed b07f404)

- **My account → Password:** current password, new password and confirmation.
  - New passwords follow the sign-up rules: 12+ characters, and different from the current one.
  - Wrong current passwords count towards the 15-minute sign-in lockout.
  - On success, every other session is signed out, the change is audited (`user.password_changed`), and a
    security email is sent. It can't be turned off and appears in the outbox as "Security".
- Accounts without a password (local dev accounts) see a note instead of the form.
- Verified by integration tests (3 new, 88 total) and the e2e flow invite → set password → change it → old
  password rejected → new one accepted (21/21).

## Change request 2026-10-29: production backend setup (✅ pushed 65df6bb)

- `.env.vercel` (git-ignored) holds every production variable, ready for Vercel "Import .env". SMTP was taken from
  IT details and verified (login only, no email sent). It also has a generated `CRON_SECRET` and placeholders for
  the Supabase strings.
- The `vercel-build` script runs migrations and seeding on every production deploy (`db-setup --hosted-only`).
  Builds without a database skip this step.
- Bug fixed: a hosted database set up from a workstation created the developer admin as active with no password,
  so they could never sign in. The account is now "invited".
- New `db:setup:prod` and `admin:invite:prod` scripts read `.env.vercel`.
- SMTP now uses connect, greeting and socket timeouts, so serverless functions fail fast and retry later.
- Open item: IT must allow port 587 on 64.141.20.79 from the internet so Vercel can reach the SMTP server.

## Change request 2026-10-28 (3): CAEDM branding (✅ pushed 9928f68)

- The CAEDM logo appears in the sidebar, the mobile header, sign-in and invitation pages. The crest is the
  favicon/app icon.
- Brand palette in `globals.css`: maroon #860038 (primary buttons, active navigation), gold #E5C047 (accents and
  dividers), blue #005493 (links, info, P2) and red #BF311A (P0). There is a brand stripe across the top of the
  sidebar and the sign-in page.
- The sidebar is now light so the full-colour logo reads correctly. Email templates use the same colours.
- Middleware no longer redirects the logo or icon files to sign-in.
- Verified by `npm run check` (85/85), Playwright (20/20), and screenshots of sign-in, overview and news.

## Change request 2026-10-28 (2): hosting, 8 AM brief, live updates, admin-managed sources (✅ committed 2df6919)

| Item | Status | Verified by |
|---|---|---|
| Postgres everywhere (Supabase prod via postgres-js; PGlite local/tests) | ✅ | 85 Vitest on Postgres; live collect; prod-mode run over the network driver |
| Morning brief at 8:00 AM Edmonton via Vercel Cron (14:00 + 15:00 UTC, DST-safe, once per day) | ✅ | digest DST tests; cron endpoint tests |
| `/api/cron/tick` secured by `CRON_SECRET` (never open in production) | ✅ | integration + prod-mode test |
| Real-time dashboard: live refresh while signed in + "new stories" banner | ✅ | e2e (two sessions) + prod-mode test |
| Admins add / test / edit / delete sources in the app | ✅ | integration + e2e (local fixture site) + prod-mode test with the real CAEDM feed |
| Single refresh at a time (DB lease); seeding never overwrites admin edits | ✅ | integration |

**Final results:** Vitest 85 passed; Playwright 20 passed (desktop and mobile); typecheck, lint and the
production build are clean. A production-mode smoke test of 20 checks passed (see DEPLOYMENT.md).

**Not done (waiting on you):**
- Supabase connection strings: `.env` has only the project URL and publishable key.
- Running `db:setup` against Supabase.
- Setting the Vercel environment variables.
- IT email credentials.
- Push to git (on hold per instruction).

## Change request 2026-10-28 (1): roles, accounts, help (✅ committed 335c3fe)

| Item | Status | Verified by |
|---|---|---|
| Developer admin ruban.peppin@caedm.ca (protected) | ✅ | unit + e2e |
| Four roles: Administrator / Manager / Member / Viewer, enforced server-side and in the UI | ✅ | permission-matrix unit test; member and viewer e2e |
| Only admins add people; invite or approve with any role | ✅ | e2e |
| Per-account email notifications (brief, alerts all/P0, assignments, access requests) | ✅ | integration + e2e |
| Work-email sign-in (browser + server domain check) | ✅ | e2e |
| Request access → admin dashboard (+ email to opted-in admins) → approve/decline | ✅ | integration + e2e |
| Contextual help (login, dashboard, every page) with developer contact | ✅ | e2e (desktop + mobile screenshot) |
| Request a feature → stored and emailed to ruban.peppin@caedm.ca (simulated until live email) | ✅ | integration + e2e |

Migration `0001` is hand-written and additive (ADD COLUMN plus new tables), and remaps `communications` →
`manager`. It was applied to the dev database without losing sessions.

Tests: Vitest **75 passed**, Playwright **16 passed**; typecheck, lint and production build all pass.

## Log

- 2026-10-28 (later): change request implemented (roles, developer admin, access requests, personal
  notifications, contextual help, feature requests).
- 2026-10-28:
  - Workspace was empty. Scaffolded Next.js; verified the pilot sources.
  - Implemented all milestones. Tuned the classifier on real data: excluded the publisher's own name from
    matching, required a substantive signal for P1, and made description-only urgency weak.
  - Fixed ECSD JSON-LD parsing (raw newlines inside strings).
  - Stripped feed "Read all" link text from descriptions.
  - Fixed the mobile filter overflow.
  - Stopped React 19 auto-resetting forms after validation errors.
