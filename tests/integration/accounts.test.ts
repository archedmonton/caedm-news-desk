import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createInvitation, setUserRole, setUserStatus, updateOwnAccount } from "@/lib/auth/users";
import { accessRequests, featureRequests, invitations, notifications, stories, users } from "@/lib/db/schema";
import { ensureDeveloperAdmin } from "@/lib/db/seed";
import { upsertStory } from "@/lib/ingest/collector";
import { processAlerts } from "@/lib/notify/alerts";
import { runScheduledDigest } from "@/lib/notify/digest";
import { notifyAssignment } from "@/lib/notify/personal";
import { joinRecipients } from "@/lib/notify/recipients";
import { DEFAULT_PRIORITY_RULES } from "@/lib/priority/rules";
import { ACCESS_REQUEST_RECEIVED, approveAccessRequest, createAccessRequest, declineAccessRequest, submitFeatureRequest } from "@/lib/requests";
import { assignFollowUp } from "@/lib/workflow";
import { sourceBySlug, testDb } from "./helpers";

const NOW = Date.parse("2026-10-28T18:00:00Z"); // 12:00 Edmonton

function addUser(db: ReturnType<typeof testDb>, email: string, extra: Partial<typeof users.$inferInsert> = {}) {
  return db.insert(users).values({ email, name: email.split("@")[0], status: "active", ...extra }).returning().get();
}

describe("developer administrator", () => {
  let db: ReturnType<typeof testDb>;
  beforeEach(() => {
    db = testDb();
  });

  it("is seeded as a protected admin and cannot be demoted or disabled", () => {
    expect(ensureDeveloperAdmin(db)).toMatchObject({ created: true, status: "active" });
    expect(ensureDeveloperAdmin(db).created).toBe(false);
    const dev = db.select().from(users).where(eq(users.email, "ruban.peppin@caedm.ca")).get()!;
    expect(dev).toMatchObject({ role: "admin", isDeveloper: true, name: "Ruban Peppin" });
    const other = addUser(db, "other.admin@caedm.ca", { role: "admin" });
    expect(() => setUserRole(dev.id, "viewer", other.id, db)).toThrow(/protected/);
    expect(() => setUserStatus(dev.id, "disabled", other.id, db)).toThrow(/protected/);
  });

  it("re-invitations of the developer always keep the admin role", async () => {
    db.insert(users).values({ email: "ruban.peppin@caedm.ca", role: "admin", status: "invited", isDeveloper: true }).run();
    await createInvitation({ email: "ruban.peppin@caedm.ca", role: "viewer", invitedBy: null }, db, NOW);
    expect(db.select().from(invitations).get()!.role).toBe("admin");
  });

  it("new users default to the member role", () => {
    expect(db.insert(users).values({ email: "x@caedm.ca" }).returning().get().role).toBe("member");
  });
});

describe("access requests", () => {
  let db: ReturnType<typeof testDb>;
  beforeEach(() => {
    db = testDb();
  });

  it("accepts work emails only, notifies opted-in admins and shows on the dashboard list", async () => {
    addUser(db, "admin.one@caedm.ca", { role: "admin" });
    addUser(db, "admin.quiet@caedm.ca", { role: "admin", notifyAccessRequests: false });
    addUser(db, "member@caedm.ca", { role: "member" });
    await expect(createAccessRequest({ name: "Jo", email: "jo@gmail.com" }, db, NOW)).rejects.toThrow(/work email/);
    const r = await createAccessRequest({ name: "Jo Smith", email: "Jo.Smith@caedm.ca", department: "Youth Ministry", requestedRole: "admin", reason: "Need news" }, db, NOW);
    expect(r.message).toBe(ACCESS_REQUEST_RECEIVED);
    const row = db.select().from(accessRequests).get()!;
    expect(row).toMatchObject({ email: "jo.smith@caedm.ca", requestedRole: "member", status: "pending" }); // admin can't be self-requested
    const n = db.select().from(notifications).where(eq(notifications.kind, "access_request")).get()!;
    expect(n.recipient).toBe("admin.one@caedm.ca");
    expect(n.html).toContain("Youth Ministry");
  });

  it("does not reveal whether an account exists and does not duplicate pending requests", async () => {
    addUser(db, "existing@caedm.ca");
    const a = await createAccessRequest({ name: "E", email: "existing@caedm.ca" }, db, NOW);
    const b = await createAccessRequest({ name: "N", email: "new@caedm.ca" }, db, NOW);
    const c = await createAccessRequest({ name: "N", email: "new@caedm.ca" }, db, NOW);
    expect([a.message, b.message, c.message]).toEqual([ACCESS_REQUEST_RECEIVED, ACCESS_REQUEST_RECEIVED, ACCESS_REQUEST_RECEIVED]);
    expect(db.select().from(accessRequests).all()).toHaveLength(1);
  });

  it("caps requests per hour to prevent flooding", async () => {
    for (let i = 0; i < 20; i++) await createAccessRequest({ name: `P${i}`, email: `p${i}@caedm.ca` }, db, NOW);
    await expect(createAccessRequest({ name: "Late", email: "late@caedm.ca" }, db, NOW)).rejects.toThrow(/Too many requests/);
    expect((await createAccessRequest({ name: "Later", email: "later@caedm.ca" }, db, NOW + 3600_001)).requestId).not.toBeNull();
  });

  it("approval sends an invitation with the chosen role; decline closes it", async () => {
    const admin = addUser(db, "boss@caedm.ca", { role: "admin" });
    const a = await createAccessRequest({ name: "A", email: "a@caedm.ca", requestedRole: "viewer" }, db, NOW);
    const b = await createAccessRequest({ name: "B", email: "b@caedm.ca" }, db, NOW);
    await approveAccessRequest(a.requestId!, "manager", { id: admin.id, name: "Boss" }, db, NOW);
    declineAccessRequest(b.requestId!, admin.id, db, NOW);
    expect(db.select().from(invitations).where(eq(invitations.email, "a@caedm.ca")).get()!.role).toBe("manager");
    expect(db.select().from(users).where(eq(users.email, "a@caedm.ca")).get()).toMatchObject({ role: "manager", status: "invited" });
    expect(db.select().from(users).where(eq(users.email, "b@caedm.ca")).get()).toBeUndefined();
    await expect(approveAccessRequest(b.requestId!, "member", { id: admin.id, name: "Boss" }, db, NOW)).rejects.toThrow(/already been handled/);
  });
});

describe("feature requests", () => {
  it("are stored and emailed to the developer with reply-to the requester", async () => {
    const db = testDb();
    const u = addUser(db, "staff@caedm.ca", { name: "Staff Person" });
    const r = await submitFeatureRequest(
      { title: "Add CBC Edmonton", description: "Please monitor CBC Edmonton local news.", category: "source", importance: "important", page: "/sources", user: { id: u.id, email: u.email, name: u.name } },
      db,
      NOW,
    );
    expect(r).toMatchObject({ deliveryStatus: "simulated", developerEmail: "ruban.peppin@caedm.ca" });
    const n = db.select().from(notifications).where(eq(notifications.kind, "feature_request")).get()!;
    expect(n.recipient).toBe("ruban.peppin@caedm.ca");
    expect(n.subject).toBe("[CAEDM News Desk] Feature request #1: Add CBC Edmonton");
    expect(n.meta).toMatchObject({ replyTo: "staff@caedm.ca" });
    expect(db.select().from(featureRequests).get()!.notificationId).toBe(n.id);
    await expect(submitFeatureRequest({ title: "x", description: "short", category: "feature", importance: "important", user: u }, db, NOW)).rejects.toThrow(/describe/);
  });
});

describe("personal email notifications", () => {
  let db: ReturnType<typeof testDb>;
  beforeEach(() => {
    db = testDb();
  });

  it("joins recipients without duplicates", () => {
    expect(joinRecipients("Team@caedm.ca", ["a@caedm.ca", "team@caedm.ca"], null)).toBe("team@caedm.ca, a@caedm.ca");
  });

  it("adds opted-in users to the brief and respects P0-only alert preferences", async () => {
    const reader = addUser(db, "reader@caedm.ca");
    addUser(db, "all.alerts@caedm.ca", { notifyAlerts: "all" });
    addUser(db, "p0.only@caedm.ca", { notifyAlerts: "p0" });
    addUser(db, "disabled@caedm.ca", { notifyDigest: true, status: "disabled" });
    updateOwnAccount(reader.id, { name: "Reader", notifyDigest: true, notifyAlerts: "none", notifyAssignments: true, notifyAccessRequests: false }, db);

    await runScheduledDigest(db, Date.parse("2026-10-28T13:31:00Z"));
    expect(db.select().from(notifications).where(eq(notifications.kind, "digest")).get()!.recipient).toBe("communications@caedm.ca, reader@caedm.ca");

    const opts = { now: NOW - 60_000, rules: DEFAULT_PRIORITY_RULES, baseline: false };
    const item = (title: string) => ({ title, url: `https://example.org/${encodeURIComponent(title)}`, publishedAt: NOW - 3600_000, updatedAt: null, description: null, descriptionSource: "none" as const, categories: [] });
    upsertStory(db, sourceBySlug(db, "covenant-health"), item("Misericordia hospital announces new safety model"), opts);
    await processAlerts(db, NOW);
    expect(db.select().from(notifications).where(eq(notifications.kind, "alert")).get()!.recipient).toBe("communications@caedm.ca, all.alerts@caedm.ca");

    upsertStory(db, sourceBySlug(db, "caedm"), item("Archbishop of Edmonton hospitalized in emergency"), { ...opts, now: NOW + 60_000 });
    await processAlerts(db, NOW + 120_000);
    const p0Alert = db.select().from(notifications).where(eq(notifications.kind, "alert")).all().at(-1)!;
    expect(p0Alert.recipient).toBe("communications@caedm.ca, all.alerts@caedm.ca, p0.only@caedm.ca");
  });

  it("emails the assignee unless they assigned themselves or opted out", async () => {
    const boss = addUser(db, "boss@caedm.ca", { role: "manager" });
    const helper = addUser(db, "helper@caedm.ca");
    const quiet = addUser(db, "quiet@caedm.ca", { notifyAssignments: false });
    const storyId = upsertStory(
      db,
      sourceBySlug(db, "ecsd"),
      { title: "Assign me", url: "https://example.org/assign", publishedAt: NOW, updatedAt: null, description: null, descriptionSource: "none", categories: [] },
      { now: NOW, rules: DEFAULT_PRIORITY_RULES, baseline: false },
    )!;
    const fu = assignFollowUp(storyId, { assigneeId: helper.id, dueAt: NOW + 86400_000, note: "Draft a post" }, boss.id, db, NOW);
    expect(await notifyAssignment({ storyId, followUpId: fu, assigneeId: helper.id, actorId: boss.id, dueAt: NOW + 86400_000, note: "Draft a post" }, db, NOW)).not.toBeNull();
    const n = db.select().from(notifications).where(eq(notifications.kind, "assignment")).get()!;
    expect(n).toMatchObject({ recipient: "helper@caedm.ca", status: "simulated" });
    expect(n.html).toContain("Draft a post");
    expect(await notifyAssignment({ storyId, followUpId: fu, assigneeId: boss.id, actorId: boss.id, dueAt: null }, db, NOW)).toBeNull();
    expect(await notifyAssignment({ storyId, followUpId: fu, assigneeId: quiet.id, actorId: boss.id, dueAt: null }, db, NOW)).toBeNull();
    expect(db.select().from(stories).where(eq(stories.id, storyId)).get()!.reviewStatus).toBe("assigned");
  });
});
