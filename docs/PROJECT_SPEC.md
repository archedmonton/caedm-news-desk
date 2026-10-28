# CAEDM News Desk — Project Specification

**Product:** CAEDM News Desk — News Intelligence & Communications Monitoring Platform
**Client:** Catholic Archdiocese of Edmonton (https://caedm.ca), Edmonton, Alberta
**Status:** Requirements approved by the project owner (2026-10-28). This document restates them as the
reference spec for the MVP.

## 1. Business problem

The Archdiocesan Communications team misses important Catholic news, Edmonton developments and partner
announcements, and sometimes only learns of them after other organizations have shared them. The team needs
one place that keeps discovering relevant news, ranks what matters, and supports follow-up, while cutting
manual monitoring and information overload.

## 2. Primary objectives

1. Automatically monitor approved Catholic and local Edmonton news sources.
2. Collect headlines, publication dates, permitted descriptions and original URLs.
3. Identify relevant Archdiocesan developments.
4. Prioritize important stories automatically (P0–P3).
5. Send a consolidated daily email briefing to `communications@caedm.ca`...
6. ...every day at **7:30 AM America/Edmonton**.
7. Send separate alerts during the day only for qualifying high-priority (P0/P1) developments.
8. Show other relevant stories in a clean, searchable dashboard.
9. Let Communications review, assign, track and complete follow-ups.
10. Show source monitoring health, errors and notification delivery.

## 3. Constraints

- No paid subscriptions, paid AI APIs, paid news aggregators, paid DB hosting, paid auth, paid scraping, or
  commercial queues. No Microsoft Entra ID requirement.
- Open-source stack. Runs locally on Windows; self-hostable later on an organization-approved server.
- Claude Code is a development tool only. It is never a runtime dependency.
- Do not deploy, incur charges, send live email, or modify external services without explicit approval.
- Live email sending is **disabled by default**.

## 4. Technology

Next.js App Router + TypeScript + Tailwind CSS + shadcn/ui-style components + Lucide icons; Node.js background
worker; SQLite + Drizzle ORM + migrations; RSS/Atom parsing, HTTP fetch, Cheerio for permitted metadata;
cron-compatible scheduling with explicit America/Edmonton handling; HTML email templates, local outbox,
configurable SMTP, optional Microsoft Graph transport abstraction; invitation-only staff auth; Vitest,
Playwright, TypeScript checks, ESLint.

## 5. Sources

Pilot (real monitoring): Edmonton Catholic Schools (ECSD), Covenant Health Alberta, Vatican News, Government
of Alberta News. Official URLs must be verified, and feeds must not be invented. Robots directives, terms
and rate limits must be respected. Where monitoring isn't possible, document the limitation and fall back
safely (manual link submission).

Expansion registry (inactive until verified): CAEDM, Catholic Social Services, ACSTA, Newman Theological
College, St. Joseph's College, Society of Saint Vincent de Paul, Edmonton Journal, EPSB, CBC Edmonton, CTV
Edmonton, CCCB, Canadian Catholic News, Holy See Press Office, other CAEDM partners and Catholic school
divisions.

## 6. Ingestion

Per story: id, headline, publisher, canonical URL, published time, first-detected time, source-updated time,
permitted short description, category, geographic relevance, priority, priority explanation, verification
status, follow-up status.

Required: scheduled checks, configurable intervals, feed parsing, safe metadata extraction, URL
normalization, duplicate prevention, related-story grouping, failed-source tracking, retry with backoff,
timeouts, response-size limits, logging, malformed-response safety, SSRF protection, and isolation so one
failing source does not affect the others. No paywall bypass, no full-article copying, no invented facts. If
there's no description, show only the headline and link.

## 7. Prioritization

Deterministic and explainable P0 (Critical) / P1 (High) / P2 (Standard) / P3 (Background). It weighs
Edmonton relevance, Archdiocesan relevance, organization importance, institutional impact, urgency, policy
significance, recency and credibility. Local Catholic developments rank above routine international news. A
high-importance organization doesn't make every article urgent. Verification status is separate from
priority. Sensitive or unverified items are labelled for human review. Every classification carries a reason.
Authorized users can override priority. Unit-tested. No paid AI.

## 8. Dashboard

Navigation: Overview, News Feed, Follow-ups, Sources, Settings. The design is minimal, professional,
accessible and responsive, with clear empty and error states.

- **Overview**: new stories, high-priority alerts, needs-review items, outstanding follow-ups, source health,
  recent articles, latest digest status.
- **News Feed**: headline, description, source, date, priority, category, review status. Search, source,
  priority and date filters, sorting, detail view, open original, mark reviewed, assign follow-up, archive.
- **Follow-ups**: assign, due dates, internal notes, status, change priority, mark covered, archive. Workflow:
  New → Reviewing → Assigned → Covered / Archived.
- **Sources**: name, URL, method, status, last success, last article, errors. Admins can enable or disable
  sources.
- **Settings**: check frequency, digest schedule, recipient, alert preferences, priority settings, staff
  access.

Every visible action must perform a real function.

## 9. Morning digest

The digest goes to `communications@caedm.ca` daily at 7:30 AM America/Edmonton. Subject format:
`CAEDM Morning News Brief | October 28, 2026`. Sections:

1. Top stories
2. Edmonton Catholic news
3. Partner updates
4. Alberta education and healthcare
5. Canadian Catholic and Vatican
6. Upcoming events (only when reliable)
7. Outstanding follow-ups

Each item shows headline, short factual summary, publisher, time, link, and priority where relevant. The
digest never repeats a story, uses a lookback window, and remembers past deliveries. It has a no-new-stories
state, a manual preview, and handles DST. Scheduled jobs are idempotent across restarts.

## 10. High-priority alerts

Only qualifying P0/P1 items trigger alerts. Required: eligibility rules, deduplication, history, retries,
configurable alert hours, failure reporting, manual override, and flood prevention. Unverified sensitive
claims go out only as clearly labelled internal review alerts. Development provides a preview screen, a
simulated outbox, a dry run and delivery history. No real email is sent locally.

## 11. Authentication and security

Production access is limited to verified, administrator-invited `@caedm.ca` users, and a domain string check
alone is not enough. Roles are **Administrator** (sources, staff, notification settings, system health, plus
all Communications permissions) and **Communications** (read and review news, follow-ups, priority changes,
mark covered). Required: session security, server-side authorization and audit logging. Development needs a
safe local experience, with no dev bypass in production. If verified email auth needs mail transport, build
the interface and keep production access disabled until it is configured. Secrets stay in environment
variables and are never hardcoded.

## 12. Data

Tables: users, sources, stories, story_sources, story_priority_history, follow_ups, follow_up_notes,
notifications, source_check_logs, audit_logs, application_settings (plus supporting auth tables). Use Drizzle
migrations, indexes and unique constraints. Timestamps are stored in UTC and displayed and scheduled in
Edmonton time. Seed data must be reproducible.

## 13–15. Milestones and definition of done

See [ROADMAP.md](ROADMAP.md) for the eight milestones and [PROGRESS.md](PROGRESS.md) for status. Definition
of done:

- The app runs locally and the dashboard shows stored stories.
- Live connectors are tested, and links open the original sources.
- Deduplication and priority classification work.
- The digest preview and alert simulation work.
- Follow-ups and source health work.
- Auth limitations are addressed.
- Tests pass, the production build succeeds, and setup docs are complete.

## 16. Future (not in MVP)

Expanded partner monitoring, newsletter ingestion, event discovery, editorial calendar, coverage analytics,
historical intelligence, local AI-assisted classification and summaries, draft generation, editorial
approvals, social publishing integrations, and AI Communications Hub integration.

## Change request: 2026-10-28 (approved by the project owner)

1. ruban.peppin@caedm.ca is the developer administrator account.
2. Role-based access: Administrator, Manager, Member, Viewer (replaces "Communications").
3. Only administrators add people. Every account sets its own email notifications.
4. Sign-in is by work email. People without an account can request access, and administrators see the
   requester's details on their dashboard.
5. Contextual help on the login screen and the dashboard, naming the developer (Ruban Peppin,
   ruban.peppin@caedm.ca) for help and support.
6. A Request a feature form that emails the request to the developer.
