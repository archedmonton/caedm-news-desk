// Renders every email template with fictional data to HTML and PNG for visual review:
//   npm run previews:email  →  artifacts/email-previews/
// Browser screenshots approximate what mail clients show; they are not Outlook or Gmail renderings.
// Sends nothing and uses no database. All names, addresses, tokens and stories below are invented.
import fs from "node:fs";
import path from "node:path";

process.env.APP_URL = "https://newsdesk.example.org";
process.env.DEVELOPER_NAME = "Ruban Peppin";
process.env.DEVELOPER_EMAIL = "ruban.peppin@caedm.ca";

const OUT = path.resolve("artifacts/email-previews");
const NOW = Date.parse("2026-10-30T14:05:00Z"); // 8:05 am Edmonton

/** Simulates a client that fully inverts colours in dark mode (e.g. Gmail and Outlook apps); images keep theirs. */
const DARK_SIMULATION = `<style>html{background:#111;filter:invert(1) hue-rotate(180deg)}img{filter:invert(1) hue-rotate(180deg)}</style>`;

async function main() {
  const { renderAccessRequest, renderAlert, renderDigest, renderInvite, renderPasswordChanged } = await import("../src/lib/notify/templates/emails");
  type Story = Parameters<typeof renderAlert>[0]["stories"][number];
  const story = (id: number, over: Partial<Story>): Story => ({
    id,
    title: "Archdiocese of Edmonton announces Advent reconciliation schedule",
    url: `https://news.example.org/stories/${id}`,
    description: "Parishes across the Archdiocese will offer additional evenings of confession during Advent, with times posted locally.",
    publisher: "Archdiocese of Edmonton",
    publishedAt: NOW - 3 * 3600_000,
    firstDetectedAt: NOW - 2 * 3600_000,
    priority: "P2",
    sensitive: false,
    verificationStatus: "official_source",
    ...over,
  });
  const top = [
    story(101, {
      title: "Catholic school board approves new safety protocol after review of downtown campus incident reported by families this week",
      publisher: "Edmonton Catholic Schools",
      priority: "P1",
      description: "Trustees approved an updated protocol covering supervision, visitor sign-in and communication with families.",
    }),
  ];
  const sections = [
    { key: "top", title: "Top stories requiring attention", stories: top, more: 0 },
    {
      key: "edmonton_catholic",
      title: "Edmonton Catholic news",
      stories: [story(102, {}), story(103, { title: "St. Joseph's Basilica hosts diocesan choir festival", description: null })],
      more: 3,
    },
    {
      key: "canadian_vatican",
      title: "Canadian Catholic & Vatican news",
      stories: [story(104, { title: "Pope Leo XIV addresses the Synod on missionary parishes", publisher: "Vatican News", priority: "P3" })],
      more: 0,
    },
  ];
  const followUps = [
    { title: "Respond to media request about the safety protocol", url: "https://news.example.org/stories/101", assignee: "Maria Santos", dueAt: NOW - 3600_000, status: "Assigned", overdue: true },
    { title: "Share Advent schedule on social channels", url: "https://news.example.org/stories/102", assignee: "Maria Santos", dueAt: NOW + 2 * 86400_000, status: "Assigned", overdue: false },
  ];
  const app = process.env.APP_URL!;
  const emails: Record<string, { html: string; subject: string }> = {
    invitation: renderInvite({
      name: "Maria Santos",
      email: "maria.santos@example.org",
      inviteUrl: `${app}/invite/EXAMPLE-ONLY-not-a-real-token`,
      role: "manager",
      invitedBy: "Ruban Peppin",
      expiresAt: NOW + 72 * 3600_000,
      appUrl: app,
      support: { name: "Ruban Peppin", email: "ruban.peppin@caedm.ca" },
    }),
    "daily-brief": renderDigest({
      now: NOW,
      sections,
      followUps,
      windowStart: NOW - 24 * 3600_000,
      appUrl: app,
      totalStories: 8,
      personal: { name: "Maria Santos", scope: "catholic", scheduleLabel: "Weekdays at 8:00 am" },
    }),
    "daily-brief-empty": renderDigest({
      now: NOW,
      sections: [],
      followUps: [],
      windowStart: NOW - 24 * 3600_000,
      appUrl: app,
      totalStories: 0,
      personal: { name: "Maria Santos", scope: "catholic", scheduleLabel: "Every day at 7:30 am" },
    }),
    "priority-alert": renderAlert({
      now: NOW,
      appUrl: app,
      stories: [
        story(201, { title: "Emergency closure of parish hall after structural concern", priority: "P0", priorityReason: "Archdiocese property; emergency; local" }),
        story(202, {
          title: "Allegations reported involving a parish volunteer program",
          priority: "P1",
          sensitive: true,
          verificationStatus: "unverified",
          publisher: "Example Community News",
        }),
      ],
    }),
    "access-request": renderAccessRequest({
      name: "Pat Example",
      email: "pat.example@example.org",
      department: "Office of Catholic Education",
      requestedRole: "Member",
      reason: "To follow education news and coordinate responses with Communications.",
      createdAt: NOW,
      appUrl: app,
    }),
    "password-changed": renderPasswordChanged({ name: "Maria Santos", when: NOW, otherSessionsEnded: 1, appUrl: app, supportEmail: "ruban.peppin@caedm.ca" }),
  };

  fs.mkdirSync(OUT, { recursive: true });
  const logo = `data:image/png;base64,${fs.readFileSync("public/caedm-logo-email.png").toString("base64")}`;
  const local = (html: string) => html.replaceAll(`${app}/caedm-logo-email.png`, logo);
  for (const [name, e] of Object.entries(emails)) fs.writeFileSync(path.join(OUT, `${name}.html`), e.html);

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const shots: [string, string, number, string?][] = [
    ["invitation", "invitation-desktop.png", 900],
    ["invitation", "invitation-mobile.png", 390],
    ["invitation", "invitation-dark-preview.png", 900, DARK_SIMULATION],
    ["daily-brief", "daily-brief-desktop.png", 900],
    ["daily-brief", "daily-brief-mobile.png", 390],
    ["daily-brief-empty", "daily-brief-empty-desktop.png", 900],
    ["priority-alert", "priority-alert-desktop.png", 900],
    ["priority-alert", "priority-alert-mobile.png", 390],
    ["access-request", "access-request-desktop.png", 900],
    ["password-changed", "password-changed-desktop.png", 900],
  ];
  for (const [name, file, width, extra] of shots) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: width < 500 ? 2 : 1 });
    await page.setContent(local(emails[name].html).replace("</head>", `${extra ?? ""}</head>`), { waitUntil: "load" });
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    await page.close();
  }
  await browser.close();

  const rows = Object.entries(emails)
    .map(([n, e]) => `<li><a href="${n}.html">${n}.html</a>: <em>${e.subject.replace(/</g, "&lt;")}</em></li>`)
    .join("\n");
  fs.writeFileSync(
    path.join(OUT, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Email previews</title><body style="font-family:Arial,sans-serif;max-width:760px;margin:24px auto;padding:0 16px">
<h1>CAEDM News Desk: email previews</h1>
<p>Rendered from the real templates with fictional data. Screenshots are Chromium renderings: they approximate, but are not, Outlook or Gmail. <code>invitation-dark-preview.png</code> simulates a client that fully inverts colours.</p>
<ul>${rows}</ul>
<p>${shots.map(([, f]) => `<a href="${f}">${f}</a>`).join(" · ")}</p></body>`,
  );
  console.log(`✓ ${Object.keys(emails).length} emails and ${shots.length} screenshots in ${path.relative(process.cwd(), OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
