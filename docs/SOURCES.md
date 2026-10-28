# Source connector results

Verified on **2026-10-28**. User-Agent: `CAEDM-NewsDesk/0.1 (+https://caedm.ca; …)`. Every fetch passes the
SSRF guard, a robots.txt check (cached 24 h), a 15 s timeout, a 2 MB cap and ≥ 1 s spacing per host. Checks
run every 30 minutes by default.

## Pilot sources (active)

| Source | Method | URL monitored | Result |
|---|---|---|---|
| Vatican News | Official RSS | `https://www.vaticannews.va/en.rss.xml` | ✅ 50 items; title, publisher description, date |
| Government of Alberta | Newsroom HTML | `https://www.alberta.ca/news` (`#block-newsfeedblock`) | ✅ 60 items; headline, lede, date (exact time for newest) |
| Covenant Health | Newsroom HTML | `https://covenanthealth.ca/news-and-events/news` (`.views-row article`) | ✅ 20 items; headline, lede, categories, date |
| Edmonton Catholic Schools | Newsroom HTML + article metadata | `https://www.ecsd.net/news`, then each **new** article's JSON-LD | ✅ 24 items; headline, publisher description, `datePublished` |

### Findings per source

**Vatican News**
- Official feed, advertised and valid.
- robots.txt: `User-agent: * Allow: /`, with
  `Content-Signal: search=yes, ai-train=no, use=reference`. We use it for reference only: headline, feed
  description and link. There is no AI training and no full-text storage.
- The feed appends "Read all" link text to descriptions; it is stripped.

**Government of Alberta**
- `https://www.alberta.ca/rss.xml` exists, but it is a Drupal site feed with a single site-level item, not
  news releases. **No release feed was found.**
- The `/news` page is allowed by robots.txt (only `/admin/`, `/search/`, `/user/*` etc. are disallowed) and
  lists date, headline and the publisher's one-sentence lede.
- Release URLs (`announcements.cfm?xID=…`) keep their `xID` query parameter for dedupe.

**Covenant Health**
- `https://covenanthealth.ca/rss.xml` carries general page updates (e.g. palliative-care resource pages),
  not news, so it was **not used**.
- The newsroom listing is allowed by robots.txt and provides headline, lede, category tags and date
  (date only, stored as 00:00 Edmonton time).

**Edmonton Catholic Schools**
- No feed: `/rss`, `/feed` and `/news/rss` return 404, and no `<link rel="alternate">` is advertised.
  robots.txt is `Allow: /`.
- The listing shows headline and URL only, so for *new* items we read the article page's publisher
  metadata (JSON-LD `datePublished`, `description`).
  - Limits: 24 article reads on the first sync, then 8 per check. Known items are never re-fetched.
  - ECSD's JSON-LD contains raw newlines inside strings (invalid strict JSON); the parser tolerates this.

## Limitations

- HTML newsroom adapters depend on page structure. If a publisher redesigns its site:
  - The check still succeeds, but logs *"Listing parsed but no items found — page structure may have
    changed"*.
  - The Sources page shows the warning, and the adapter in `src/lib/ingest/adapters/parsers.ts` needs a
    selector update.
- Ask ECSD, Covenant Health and the Government of Alberta whether an official RSS feed is available or
  planned. If one appears, switch the source to the `rss` adapter.
- Date-only listings (Covenant, older Alberta items) have no publication time.
- Paywalled or login-protected content is never accessed. Only publisher-supplied summaries are stored,
  truncated to 400 characters with attribution. No summaries are generated.

## Fallback: manual link submission

The News Feed's **Submit a link** form handles news from sources that can't be monitored automatically.
- It reads only the page's own metadata (title, description, published time), and only where robots.txt
  allows.
- Otherwise staff enter the headline and a short factual summary.
- Submitted items are always marked **Unverified**.

## Expansion registry (inactive)

These are in `src/lib/ingest/registry.ts` and appear on the Sources page as *Not verified*. They **cannot be
enabled** until someone has:
1. confirmed an official feed or newsroom URL,
2. checked robots.txt and terms, and
3. configured an adapter.

| Source | Notes |
|---|---|
| Catholic Archdiocese of Edmonton | **Feed verified** (`https://caedm.ca/feed/`, WordPress RSS, robots.txt allows). Seeded *disabled*; an admin can enable it from Sources. |
| Catholic Social Services, ACSTA, Newman Theological College, St. Joseph's College, St. Joseph Seminary, SSVP Edmonton | Partner organizations; URLs to confirm. |
| Edmonton Journal, CBC Edmonton, CTV Edmonton | Media; check terms and paywalls. Items would be marked *unverified* (third-party reporting). |
| Edmonton Public Schools, CCCB, Canadian Catholic News, Holy See Press Office | Need feed verification. |
| Catholic school divisions (Greater St. Albert, Elk Island, Evergreen, Living Waters, East Central Alberta, St. Thomas Aquinas, Centre-Nord), GRACE | From the CAEDM *Schools & Colleges* page (`caedm.ca/offices/schools-colleges/`). |

To add a source:
1. Verify its feed.
2. Set `feedUrl`, `adapter` (usually `rss`) and `verified: true` in the registry.
3. Run `npm run db:setup`. This is idempotent and keeps admin toggles.
4. Enable the source on the Sources page.
