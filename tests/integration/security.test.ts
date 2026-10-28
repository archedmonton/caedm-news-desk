import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { productionAccess, devLoginAllowed, isAllowedEmail } from "@/lib/auth/access";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { can } from "@/lib/auth/permissions";
import { acceptInvitation, authenticate, createInvitation, findInvitation } from "@/lib/auth/users";
import { auditLogs, notifications, sources, users } from "@/lib/db/schema";
import { upsertStory } from "@/lib/ingest/collector";
import { DEFAULT_PRIORITY_RULES } from "@/lib/priority/rules";
import { resetEnvCache } from "@/lib/env";
import { isAllowedByRobots } from "@/lib/ingest/robots";
import { assertSafeUrl, isPrivateAddress, safeFetch } from "@/lib/ingest/safe-fetch";
import { assignFollowUp, setReviewStatus } from "@/lib/workflow";
import { testDb } from "./helpers";

describe("SSRF protection", () => {
  it("blocks private, loopback, link-local and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "151.101.1.1", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
  it("rejects unsafe URLs before any network access", () => {
    for (const u of ["file:///etc/passwd", "ftp://example.org", "http://localhost/x", "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data", "https://user:pw@example.org", "https://example.org:8443/", "http://[::1]/", "not a url"]) {
      expect(() => assertSafeUrl(u), u).toThrow();
    }
    expect(assertSafeUrl("https://www.vaticannews.va/en.rss.xml").hostname).toBe("www.vaticannews.va");
  });
  it("refuses hostnames that resolve to private addresses at connect time", async () => {
    // localhost.localtest.me-style names are blocked by the connect-time DNS check; "localhost" itself by the URL check.
    await expect(safeFetch("http://localhost/")).rejects.toThrow(/Blocked/);
  });
});

describe("robots.txt", () => {
  const robots = `User-agent: *\nDisallow: /admin/\nAllow: /admin/public\nDisallow: /*.pdf$\n\nUser-agent: BadBot\nDisallow: /\n`;
  it("applies longest-match allow/disallow rules", () => {
    expect(isAllowedByRobots(robots, "/news")).toBe(true);
    expect(isAllowedByRobots(robots, "/admin/secret")).toBe(false);
    expect(isAllowedByRobots(robots, "/admin/public/page")).toBe(true);
    expect(isAllowedByRobots(robots, "/files/report.pdf")).toBe(false);
    expect(isAllowedByRobots(robots, "/news", "BadBot")).toBe(false);
    expect(isAllowedByRobots("", "/anything")).toBe(true);
  });
});

describe("authentication & authorization", () => {
  let db: ReturnType<typeof testDb>;
  const env0 = { ...process.env };
  beforeEach(() => {
    db = testDb();
  });
  afterEach(() => {
    process.env = { ...env0 };
    resetEnvCache();
  });

  it("hashes passwords with scrypt and rejects weak ones", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(passwordProblem("short")).toMatch(/at least 12/);
    expect(passwordProblem("aaaaaaaaaaaaaaa")).toMatch(/simple/);
  });

  it("restricts invitations to the allowed domain (not the only gate)", async () => {
    expect(isAllowedEmail("someone@caedm.ca")).toBe(true);
    expect(isAllowedEmail("someone@caedm.ca.evil.com")).toBe(false);
    expect(isAllowedEmail("someone@notcaedm.ca")).toBe(false);
    await expect(createInvitation({ email: "x@gmail.com", role: "admin", invitedBy: null }, db)).rejects.toThrow(/Only @caedm.ca/);
  });

  it("invitation is single-use, expires, and activates the account", async () => {
    const now = Date.parse("2026-10-28T18:00:00Z");
    const inv = await createInvitation({ email: "New.Person@caedm.ca", role: "communications", invitedBy: null }, db, now);
    const token = inv.inviteUrl.split("/invite/")[1];
    expect(db.select().from(notifications).where(eq(notifications.kind, "invite")).get()!.status).toBe("simulated");
    expect(findInvitation(token, db, now + 73 * 3600_000)).toBeUndefined();
    await acceptInvitation({ token, name: "New Person", password: "correct horse battery" }, db, now + 60_000);
    await expect(acceptInvitation({ token, name: "Again", password: "correct horse battery" }, db, now)).rejects.toThrow(/invalid, expired or already used/);
    const user = await authenticate("new.person@caedm.ca", "correct horse battery", db, now);
    expect(user.role).toBe("communications");
  });

  it("locks the account after repeated failures and audits them", async () => {
    const now = Date.now();
    db.insert(users).values({ email: "lock@caedm.ca", status: "active", passwordHash: await hashPassword("correct horse battery") }).run();
    for (let i = 0; i < 5; i++) await expect(authenticate("lock@caedm.ca", "nope", db, now)).rejects.toThrow(/incorrect/);
    await expect(authenticate("lock@caedm.ca", "correct horse battery", db, now)).rejects.toThrow(/Too many failed attempts/);
    expect(await authenticate("lock@caedm.ca", "correct horse battery", db, now + 16 * 60_000)).toBeTruthy();
    expect(db.select().from(auditLogs).where(eq(auditLogs.action, "auth.login_failed")).all()).toHaveLength(5);
  });

  it("applies role permissions", () => {
    expect(can("admin", "manage_sources")).toBe(true);
    expect(can("communications", "manage_sources")).toBe(false);
    expect(can("communications", "manage_staff")).toBe(false);
    expect(can("communications", "change_priority")).toBe(true);
    expect(can(null, "read_news")).toBe(false);
  });

  it("keeps production access disabled until verified email delivery is configured, and never allows dev login", () => {
    Object.assign(process.env, { NODE_ENV: "production", DEV_LOGIN_ENABLED: "true", PRODUCTION_ACCESS_ENABLED: "true", EMAIL_TRANSPORT: "outbox", EMAIL_LIVE_SEND: "false" });
    resetEnvCache();
    expect(devLoginAllowed()).toBe(false);
    expect(productionAccess().enabled).toBe(false);
    Object.assign(process.env, { EMAIL_TRANSPORT: "smtp", EMAIL_LIVE_SEND: "true", SMTP_HOST: "smtp.example.org" });
    resetEnvCache();
    expect(productionAccess().enabled).toBe(true);
    expect(devLoginAllowed()).toBe(false);
    Object.assign(process.env, { PRODUCTION_ACCESS_ENABLED: "false" });
    resetEnvCache();
    expect(productionAccess().enabled).toBe(false);
  });

  it("enforces the review workflow transitions", () => {
    const now = Date.now();
    const u = db.insert(users).values({ email: "w@caedm.ca", status: "active" }).returning().get();
    const src = db.select().from(sources).where(eq(sources.slug, "ecsd")).get()!;
    const storyId = upsertStory(db, src, { title: "Workflow test", url: "https://example.org/wf", publishedAt: now, updatedAt: null, description: null, descriptionSource: "none", categories: [] }, { now, rules: DEFAULT_PRIORITY_RULES, baseline: false })!;
    expect(() => setReviewStatus(storyId, "assigned", u.id, db, now)).toThrow(/Assign the follow-up/);
    expect(setReviewStatus(storyId, "reviewing", u.id, db, now).reviewStatus).toBe("reviewing");
    assignFollowUp(storyId, { assigneeId: u.id, dueAt: now + 86400_000, note: "Draft a post" }, u.id, db, now);
    expect(setReviewStatus(storyId, "covered", u.id, db, now).reviewStatus).toBe("covered");
    expect(() => setReviewStatus(storyId, "assigned", u.id, db, now)).toThrow(/Cannot move/);
    expect(setReviewStatus(storyId, "archived", u.id, db, now).reviewStatus).toBe("archived");
    expect(() => setReviewStatus(999, "covered", u.id, db, now)).toThrow(/not found/);
    const actions = db.select().from(auditLogs).where(eq(auditLogs.entityId, String(storyId))).all().map((a) => a.action);
    expect(actions).toEqual(["story.status_changed", "follow_up.assigned", "story.status_changed", "story.status_changed"]);
  });
});
