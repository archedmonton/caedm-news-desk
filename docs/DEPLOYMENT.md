# Deployment, IT requirements & production readiness

> Nothing has been deployed. Live email is disabled. These steps need IT approval.

## Target architecture

```
          HTTPS (org TLS cert)
Staff ──▶ IIS / nginx reverse proxy ──▶ Node 24 LTS: `npm start` (Next.js, port 3000, localhost only)
                                        Node 24 LTS: `npm run worker` (no inbound port)
                                              │
                                     data/caedm-news-desk.db (SQLite, WAL)
                                              │
                                  Approved SMTP relay  or  Microsoft Graph (Mail.Send)
```

Both processes share the same code and database file. Run **exactly one** worker. Scheduled jobs are
idempotent, so an accidental second worker won't duplicate digests or alerts, but it does double the fetch
load.

## IT requirements

| Item | Requirement |
|---|---|
| Server | Existing Windows Server 2019+ or Linux VM: 2 vCPU, 2 GB RAM, 5 GB disk. |
| Runtime | Node.js 24 LTS (≥ 22.12 works). Building `better-sqlite3` needs no compiler on supported platforms (prebuilt binaries). |
| Network (outbound) | HTTPS (443) to `www.vaticannews.va`, `www.alberta.ca`, `covenanthealth.ca`, `www.ecsd.net` (and future sources). The SMTP relay or `login.microsoftonline.com` + `graph.microsoft.com`. |
| Network (inbound) | 443 only via the reverse proxy; restrict to the staff network or VPN if possible. |
| TLS | Organization certificate on the proxy. Set `APP_URL=https://newsdesk.caedm.ca` (or chosen hostname). |
| Email: SMTP option | An authenticated relay that may send as `newsdesk@caedm.ca` (or an approved sender) to `communications@caedm.ca` and staff addresses. |
| Email: Graph option | An Entra app registration (client credentials) with **application** `Mail.Send`, restricted to one sender mailbox with an Application Access Policy. Entra is not required for staff sign-in. |
| Secrets | Stored in the service environment or a protected `.env.local` readable only by the service account. Never in git. |
| Backups | Nightly `sqlite3 data/caedm-news-desk.db ".backup backup.db"` (safe while running), with 30-day retention. |
| Monitoring | `GET /api/health` returns 200 with worker heartbeat age. Alert if not OK or if `workerLastTickSecondsAgo > 300`. |

## Installation (production)

```bash
git clone <internal repo> caedm-news-desk && cd caedm-news-desk
npm ci
cp .env.example .env.local      # then edit values (see below)
npm run build
npm run db:setup                # migrations + source registry (no dev users or samples in production)
```

Production `.env.local`:

```ini
NODE_ENV=production
APP_URL=https://newsdesk.caedm.ca
DATABASE_PATH=./data/caedm-news-desk.db
ALLOWED_EMAIL_DOMAIN=caedm.ca
DEV_LOGIN_ENABLED=false            # ignored in production anyway
EMAIL_TRANSPORT=smtp               # or graph
EMAIL_LIVE_SEND=true               # only after IT approval
EMAIL_FROM="CAEDM News Desk <newsdesk@caedm.ca>"
SMTP_HOST=… SMTP_PORT=587 SMTP_USER=… SMTP_PASSWORD=…
PRODUCTION_ACCESS_ENABLED=true     # sign-in stays disabled until this AND live email are set
```

Run as services:
- **Windows (NSSM):**
  - `nssm install NewsDeskWeb "C:\Program Files\nodejs\npm.cmd" start`
  - `nssm install NewsDeskWorker "C:\Program Files\nodejs\npm.cmd" run worker`
  - Set the working directory for both and enable restart on failure.
- **Linux (systemd):** two units with `WorkingDirectory=` and `Restart=always`.

Bootstrap the first administrator from the server shell. It needs operator access:

```bash
npm run admin:invite -- firstname.lastname@caedm.ca admin
```

This also emails the invitation. Everyone else is invited from **Settings → Staff access**.

## Production readiness checklist

- [ ] IT approves the hosting server, hostname and TLS certificate.
- [ ] Mail transport approved and credentials issued (SMTP relay or Graph app with a mailbox-scoped policy).
- [ ] Send a test brief to a test mailbox (set the recipient in Settings first), then switch it to
      `communications@caedm.ca`.
- [ ] `EMAIL_LIVE_SEND=true` and `PRODUCTION_ACCESS_ENABLED=true` are set only after the step above.
- [ ] First admin bootstrapped; dev accounts not present (`db:setup` never creates them in production).
- [ ] The reverse proxy forwards only HTTPS and sets `X-Forwarded-*`. The app port is bound to localhost.
- [ ] Nightly backup is scheduled and a restore has been tested.
- [ ] `/api/health` is monitored.
- [ ] Communications has reviewed the priority rules and alert hours/limits in Settings.
- [ ] Publishers contacted (optional, recommended): ECSD, Covenant Health and GoA are asked about official
      RSS feeds.
- [ ] The privacy officer has reviewed the data stored: staff names and emails, story metadata, audit logs.

## Data & privacy notes

- Stored per story: headline, publisher summary (≤ 400 chars), URL, dates, classification and workflow data.
  No article bodies are stored.
- Staff data: name, work email, role, scrypt password hash, last sign-in. Sessions store a SHA-256 of the
  token only.
- Audit log: every sign-in, failed sign-in, and every workflow, settings, source and staff change.
