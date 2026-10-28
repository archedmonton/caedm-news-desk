# CAEDM News Desk — Roadmap

## MVP milestones

1. **Project foundation**: workspace inspection, architecture docs, Next.js app, dependencies, SQLite and
   Drizzle, CLAUDE.md, .env.example, README, test and build scripts.
2. **User interface**: dashboard shell, Overview, News Feed, article detail, Follow-ups, Sources, Settings,
   responsive layout, working sample-data flows.
3. **News collection**: source adapters, the four verified pilot sources, real stored records, dedupe,
   error and monitoring logs, live data in the dashboard.
4. **Priority engine**: P0–P3 rules, relevance, explanations, user overrides, classification tests.
5. **Notifications**: digest and alert templates, scheduling worker, preview and outbox, idempotency and
   retries, Edmonton timezone tests.
6. **Staff workflow**: auth foundation, roles and permissions, follow-up assignment, notes, due dates, audit
   history.
7. **Quality and hardening**: typecheck, lint, unit, integration and Playwright tests, desktop and mobile UI,
   failure and recovery, security and compliance review.
8. **Delivery**: setup instructions, connector results, deployment architecture, IT requirements,
   production checklist, limitations, future features.

## Next phase (post-MVP, recommended order)

1. IT production setup: server, TLS, SMTP relay or Graph, backups, first admin.
2. Activate the expansion sources after verification (CAEDM feed already verified, see
   [SOURCES.md](SOURCES.md)).
3. Official partner newsletter ingestion (dedicated mailbox → parser).
4. Enhanced event discovery (structured event feeds and iCal).
5. Editorial calendar and coverage analytics.
6. Historical news intelligence (search across archive, trends).
7. Local AI-assisted classification and summaries, using a self-hosted open model, opt-in and labelled.
8. Communications draft generation and editorial approvals.
9. Approved social publishing integrations.
10. Integration with a future AI Communications Hub.
