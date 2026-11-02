import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { COLORS } from "@/lib/notify/templates/layout";
import { renderAccessRequest, renderAlert, renderDigest, renderInvite, renderPasswordChanged, type EmailStory } from "@/lib/notify/templates/emails";

const NOW = Date.parse("2026-10-30T15:00:00Z");
const APP = "https://newsdesk.example.org";

/** WCAG relative-luminance contrast ratio between two #rrggbb colours. */
function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const story = (over: Partial<EmailStory> = {}): EmailStory => ({
  id: 1,
  title: "Archdiocese announces Advent schedule",
  url: "https://caedm.ca/news/advent",
  description: "Parishes across Edmonton will hold additional reconciliation services.",
  publisher: "Archdiocese of Edmonton",
  publishedAt: NOW - 3600_000,
  firstDetectedAt: NOW - 3000_000,
  priority: "P1",
  sensitive: false,
  verificationStatus: "official_source",
  ...over,
});

const invite = () =>
  renderInvite({
    name: "Maria Santos",
    email: "maria.santos@caedm.ca",
    inviteUrl: `${APP}/invite/EXAMPLE-TOKEN-NOT-REAL`,
    role: "manager",
    invitedBy: "Ruban Peppin",
    expiresAt: NOW + 72 * 3600_000,
    appUrl: APP,
    support: { name: "Ruban Peppin", email: "ruban.peppin@caedm.ca" },
  });

const all = () => ({
  invite: invite().html,
  brief: renderDigest({
    now: NOW,
    sections: [{ key: "top", title: "Top stories requiring attention", stories: [story()], more: 0 }],
    followUps: [],
    windowStart: NOW - 24 * 3600_000,
    appUrl: APP,
    totalStories: 1,
    personal: { name: "Maria", scope: "catholic", scheduleLabel: "Every day at 8:00 am" },
  }).html,
  alert: renderAlert({ now: NOW, stories: [story({ priority: "P0" })], appUrl: APP }).html,
  access: renderAccessRequest({
    name: "Pat Example",
    email: "pat@caedm.ca",
    department: "Education",
    requestedRole: "Member",
    reason: "",
    createdAt: NOW,
    appUrl: APP,
  }).html,
  security: renderPasswordChanged({ name: "Maria", when: NOW, otherSessionsEnded: 1, appUrl: APP, supportEmail: "help@caedm.ca" }).html,
});

describe("email templates", () => {
  const saved = process.env.APP_URL;
  beforeAll(() => {
    process.env.APP_URL = APP;
    resetEnvCache();
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = saved;
    resetEnvCache();
  });

  it("draws the invitation button on a table cell, so Outlook can't drop its colour and hide the white label", () => {
    const html = invite().html;
    const button = html.match(/<td[^>]*bgcolor="#860038"[^>]*>\s*<a [^>]*>([^<]+)<\/a>/);
    expect(button?.[1]).toBe("Accept invitation");
    expect(button?.[0]).toContain("color:#ffffff");
    expect(contrast("#ffffff", COLORS.accent)).toBeGreaterThan(7);
  });

  it("never puts white text on a link or element that has no coloured cell behind it", () => {
    for (const [name, html] of Object.entries(all())) {
      const whiteText = [...html.matchAll(/<(\w+)[^>]*(?<![-\w])color:#(?:fff|ffffff)\b[^>]*>/gi)];
      for (const m of whiteText) {
        const before = html.slice(Math.max(0, m.index! - 400), m.index);
        expect(before, `${name}: ${m[0].slice(0, 80)}`).toMatch(/<td[^>]*bgcolor="#860038"[^>]*>\s*$/);
      }
      expect(html, name).not.toMatch(/<a [^>]*background(-color)?:/);
    }
  });

  it("uses readable text colours on white (WCAG AA, 4.5:1)", () => {
    for (const c of [COLORS.ink, COLORS.muted, COLORS.accent, COLORS.goldText, COLORS.P0, COLORS.P1, COLORS.P2]) {
      expect(contrast(c, "#ffffff"), c).toBeGreaterThanOrEqual(4.5);
    }
    // The bright gold is decoration only: it must never be used as a text colour.
    for (const [name, html] of Object.entries(all())) expect(html, name).not.toMatch(/[^-]color:#e5c047/i);
  });

  it("uses absolute https links and the configured address only", () => {
    for (const [name, html] of Object.entries(all())) {
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      expect(hrefs.length, name).toBeGreaterThan(0);
      for (const h of hrefs) expect(h, `${name}: ${h}`).toMatch(/^(https:\/\/|mailto:)/);
      expect(html, name).not.toContain("localhost");
    }
  });

  it("personalises the invitation and states the expiry, role and a fallback link", () => {
    const { html, text, subject } = invite();
    expect(subject).toBe("Your invitation to join CAEDM News Desk");
    expect(html).toContain("Dear Maria Santos,");
    expect(html).toContain("Manager: ");
    expect(html).toContain("This link expires");
    expect(html).toContain(`>${APP}/invite/EXAMPLE-TOKEN-NOT-REAL</a>`);
    expect(text).toContain(`${APP}/invite/EXAMPLE-TOKEN-NOT-REAL`);
  });

  it("links the brief's settings to Notifications & alerts and access requests to Team management", () => {
    expect(all().brief).toContain(`${APP}/notifications#brief`);
    expect(all().access).toContain(`${APP}/team`);
  });
});
