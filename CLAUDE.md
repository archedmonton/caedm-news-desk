# CLAUDE.md

Guidance for AI assistants working in this repository.

## Project

CAEDM News Desk is an internal news-monitoring dashboard for the Catholic Archdiocese of Edmonton's
Communications team. It is built with Next.js 15 (App Router, server components and server actions), SQLite
via Drizzle, and a separate Node worker. Read `docs/ARCHITECTURE.md` first, and keep `docs/PROGRESS.md`
current.

## Commands

- `npm run check`: typecheck, lint and Vitest. Run it before finishing any change.
- `npm run test:e2e`: Playwright, using an isolated `data/e2e.db` on port 3210 (port 3100 is used by
  another local project).
- `npm run build`: production build.
- `npm run db:generate`: run after editing `src/lib/db/schema.ts`. Commit the generated `drizzle/` SQL.
- `npm run collect` and `npm run worker` make **real HTTP requests** to the publishers. Use them sparingly.

## Hard rules

- **Never send real email.** Live delivery needs `EMAIL_LIVE_SEND=true` plus a configured transport; the
  default is the simulated outbox. Do not change this default.
- Never deploy, push, or modify external services without explicit approval from the project owner.
- No paid APIs or services. Classification is deterministic (`src/lib/priority`). Do not add a cloud AI
  dependency.
- All outbound HTTP must go through `safeFetch` (SSRF guard) and `assertRobotsAllowed`. Use `politeFetch`
  in the collector.
- Don't store article bodies, and don't invent summaries. Use only publisher-supplied descriptions,
  truncated, or staff-entered text. With no description, show the headline and link only.
- Don't activate a source until its official feed or newsroom URL and robots.txt are verified. Record the
  evidence in `docs/SOURCES.md`.
- Every server action must call `requireUser(permission)` and `audit(...)` for mutations. Middleware is
  UX-only.
- Dev sign-in must stay impossible in production: `devLoginAllowed()` checks `NODE_ENV`.
- Store timestamps as UTC milliseconds. Use the helpers in `src/lib/time.ts` for anything Edmonton-local,
  and never hardcode UTC offsets.
- Scheduled jobs must stay idempotent through unique `notifications.dedupe_key` values.

## Layout

- `src/lib/ingest`: safe fetch, robots, URL normalization, adapters (pure parsers in
  `adapters/parsers.ts`), collector, source registry.
- `src/lib/priority`: rules (defaults, editable in Settings) and classifier. Tests:
  `tests/unit/classify.test.ts`.
- `src/lib/notify`: templates, transports, delivery and retry, digest, alerts.
- `src/lib/auth`: passwords (scrypt), sessions, invitations, access gates, permissions.
- `src/actions`: server actions. `src/app/(app)`: authenticated pages.
- `worker/index.ts`: the 60 s tick loop. `scripts/`: CLIs.

## Conventions

- UI primitives in `src/components/ui/primitives.tsx` follow the shadcn/ui pattern. Use the theme tokens in
  `globals.css` (navy/gold, plus priority colours `p0`–`p3`).
- Forms that need inline results use `ActionForm`, and its actions return `ActionState`. Simple buttons use
  plain `<form action>`.
- Keep comment density low; explain *why*, not *what*.
