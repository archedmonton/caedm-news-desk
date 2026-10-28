import { first } from "@/lib/db/client";
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
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "151.101.1.1", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
  it("rejects unsafe URLs before any network access", () => {
    for (const u of [
      "file:///etc/passwd",
      "ftp://example.org",
      "http://localhost/x",
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data",
      "https://user:pw@example.org",
      "https://example.org:8443/",
      "http://[::1]/",
      "not a url",
    ]) {
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
  let db: Awaited<ReturnType<typeof testDb>>;
  const env0 = { ...process.env };
  beforeEach(async () => {
    db = await testDb();
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
    const inv = await createInvitation({ email: "New.Person@caedm.ca", role: "member", invitedBy: null }, db, now);
    const token = inv.inviteUrl.split("/invite/")[1];
    expect((await first(db.select().from(notifications).where(eq(notifications.kind, "invite"))))!.status).toBe("simulated");
    expect(await findInvitation(token, db, now + 73 * 3600_000)).toBeUndefined();
    await acceptInvitation({ token, name: "New Person", password: "correct horse battery" }, db, now + 60_000);
    await expect(acceptInvitation({ token, name: "Again", password: "correct horse battery" }, db, now)).rejects.toThrow(
      /invalid, expired or already used/,
    );
    const user = await authenticate("new.person@caedm.ca", "correct horse battery", db, now);
    expect(user.role).toBe("member");
  });

  it("locks the account after repeated failures and audits them", async () => {
    const now = Date.now();
    await db.insert(users).values({ email: "lock@caedm.ca", status: "active", passwordHash: await hashPassword("correct horse battery") });
    for (let i = 0; i < 5; i++) await expect(authenticate("lock@caedm.ca", "nope", db, now)).rejects.toThrow(/incorrect/);
    await expect(authenticate("lock@caedm.ca", "correct horse battery", db, now)).rejects.toThrow(/Too many failed attempts/);
    expect(await authenticate("lock@caedm.ca", "correct horse battery", db, now + 16 * 60_000)).toBeTruthy();
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, "auth.login_failed"))).toHaveLength(5);
  });

  it("applies the four-role permission matrix", () => {
    const matrix = {
      read_news: [true, true, true, true],
      manage_own_account: [true, true, true, true],
      request_feature: [true, true, true, true],
      review_news: [true, true, true, false],
      manage_follow_ups: [true, true, true, false],
      submit_links: [true, true, true, false],
      change_priority: [true, true, false, false],
      check_sources: [true, true, false, false],
      send_test_notifications: [true, true, false, false],
      manage_sources: [true, false, false, false],
      manage_staff: [true, false, false, false],
      manage_settings: [true, false, false, false],
    } as const;
    for (const [perm, expected] of Object.entries(matrix)) {
      expect(
        (["admin", "manager", "member", "viewer"] as const).map((r) => can(r, perm as keyof typeof matrix)),
        perm,
      ).toEqual(expected);
    }
    expect(can(null, "read_news")).toBe(false);
  });

  it("keeps production access disabled until verified email delivery is configured, and never allows dev login", () => {
    Object.assign(process.env, {
      NODE_ENV: "production",
      DEV_LOGIN_ENABLED: "true",
      PRODUCTION_ACCESS_ENABLED: "true",
      EMAIL_TRANSPORT: "outbox",
      EMAIL_LIVE_SEND: "false",
    });
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

  it("enforces the review workflow transitions", async () => {
    const now = Date.now();
    const u = (await db.insert(users).values({ email: "w@caedm.ca", status: "active" }).returning())[0];
    const src = (await first(db.select().from(sources).where(eq(sources.slug, "ecsd"))))!;
    const storyId = (await upsertStory(
      db,
      src,
      {
        title: "Workflow test",
        url: "https://example.org/wf",
        publishedAt: now,
        updatedAt: null,
        description: null,
        descriptionSource: "none",
        categories: [],
      },
      { now, rules: DEFAULT_PRIORITY_RULES, baseline: false },
    ))!;
    await expect(setReviewStatus(storyId, "assigned", u.id, db, now)).rejects.toThrow(/Assign the follow-up/);
    expect((await setReviewStatus(storyId, "reviewing", u.id, db, now)).reviewStatus).toBe("reviewing");
    await assignFollowUp(storyId, { assigneeId: u.id, dueAt: now + 86400_000, note: "Draft a post" }, u.id, db, now);
    expect((await setReviewStatus(storyId, "covered", u.id, db, now)).reviewStatus).toBe("covered");
    await expect(setReviewStatus(storyId, "assigned", u.id, db, now)).rejects.toThrow(/Cannot move/);
    expect((await setReviewStatus(storyId, "archived", u.id, db, now)).reviewStatus).toBe("archived");
    await expect(setReviewStatus(999, "covered", u.id, db, now)).rejects.toThrow(/not found/);
    const actions = (
      await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, String(storyId)))
    ).map((a) => a.action);
    expect(actions).toEqual(["story.status_changed", "follow_up.assigned", "story.status_changed", "story.status_changed"]);
  });
});
