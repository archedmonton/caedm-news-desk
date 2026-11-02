import { eq } from "drizzle-orm";
import net from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInvitation, inspectInvitation, INVITE_REPEAT_GUARD_MS } from "@/lib/auth/users";
import { first } from "@/lib/db/client";
import { invitations, notifications, users } from "@/lib/db/schema";
import { publicAppUrl, resetEnvCache } from "@/lib/env";
import { deliverNotification, requeueUnconfirmed, retryDeliveries, STALE_CLAIM_MS } from "@/lib/notify/deliver";
import { BRIEF_NOW_GUARD_MS, sendBriefNow } from "@/lib/notify/digest";
import { createSmtpTransport, isUncertainDelivery, setTransportOverride, UncertainDeliveryError, type MailTransport } from "@/lib/notify/transport";
import { testDb } from "./helpers";

const NOW = Date.parse("2026-10-30T18:00:00Z");
const OP = "6f1c2b9e-4d3a-4f6b-9a1e-2c3d4e5f6a7b";
const OP2 = "0b7f9a8c-1e2d-4c3b-8a9f-7e6d5c4b3a21";

type Mode = "ok" | "hold-after-data" | "reject-rcpt" | "no-greeting";

/** Minimal SMTP server on localhost, so the real nodemailer client is exercised (no network, no real email). */
async function fakeSmtp(mode: Mode) {
  const received: string[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((sock) => {
    sockets.add(sock);
    sock.on("error", () => {});
    if (mode !== "no-greeting") sock.write("220 fake.test ESMTP\r\n");
    let buf = "";
    let inData = false;
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buf.indexOf("\r\n.\r\n");
          if (end < 0) return;
          received.push(buf.slice(0, end));
          buf = buf.slice(end + 5);
          inData = false;
          // "hold-after-data": the message is kept (as Exchange queues it) but the final reply never comes.
          if (mode !== "hold-after-data") sock.write("250 2.6.0 Queued mail for delivery\r\n");
          continue;
        }
        const nl = buf.indexOf("\r\n");
        if (nl < 0) return;
        const cmd = buf.slice(0, nl).slice(0, 4).toUpperCase();
        buf = buf.slice(nl + 2);
        if (cmd === "EHLO" || cmd === "HELO") sock.write("250-fake.test\r\n250 8BITMIME\r\n");
        else if (cmd === "MAIL" || cmd === "RSET") sock.write("250 OK\r\n");
        else if (cmd === "RCPT") sock.write(mode === "reject-rcpt" ? "550 5.1.1 Recipient not found\r\n" : "250 OK\r\n");
        else if (cmd === "DATA") {
          sock.write("354 Start mail input\r\n");
          inData = true;
        } else if (cmd === "QUIT") sock.end("221 Bye\r\n");
        else sock.write("502 Not implemented\r\n");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    received,
    close: () =>
      new Promise<void>((r) => {
        for (const s of sockets) s.destroy();
        server.close(() => r());
      }),
  };
}

const smtp = (port: number) =>
  createSmtpTransport({ host: "127.0.0.1", port, secure: false, from: "News Desk <noreply@caedm.test>", socketTimeoutMs: 400, deadlineMs: 1500 });
const MSG = { to: "someone@caedm.ca", subject: "Test", html: "<p>Hi</p>", text: "Hi" };

describe("SMTP outcome classification (real nodemailer, local fake server)", () => {
  let server: Awaited<ReturnType<typeof fakeSmtp>> | null = null;
  afterEach(async () => {
    await server?.close();
    server = null;
  });

  it("succeeds when the server confirms", async () => {
    server = await fakeSmtp("ok");
    await expect(smtp(server.port).send(MSG)).resolves.toBeTruthy();
    expect(server.received).toHaveLength(1);
  });

  it("reports 'unconfirmed', not 'failed', when the server took the message but never replied", async () => {
    server = await fakeSmtp("hold-after-data");
    const started = Date.now();
    const err = await smtp(server.port)
      .send(MSG)
      .catch((e) => e);
    expect(isUncertainDelivery(err)).toBe(true);
    expect(server.received).toHaveLength(1); // the "recipient" got it, as in production
    expect(Date.now() - started).toBeLessThan(3000); // bounded, never hangs
  });

  it("reports a plain failure (safe to retry) when the server refuses the message", async () => {
    server = await fakeSmtp("reject-rcpt");
    const err = await smtp(server.port)
      .send(MSG)
      .catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(isUncertainDelivery(err)).toBe(false);
    expect(server.received).toHaveLength(0);
  });

  it("reports a plain failure, within the deadline, when the server never greets", async () => {
    server = await fakeSmtp("no-greeting");
    const started = Date.now();
    const err = await smtp(server.port)
      .send(MSG)
      .catch((e) => e);
    expect(isUncertainDelivery(err)).toBe(false);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe("delivery state machine", () => {
  let db: Awaited<ReturnType<typeof testDb>>;
  let sends = 0;
  const transport = (impl: () => Promise<void>): MailTransport => ({
    name: "test",
    async send() {
      sends++;
      await impl();
      return {};
    },
  });
  const queue = async () =>
    (
      await db
        .insert(notifications)
        .values({ kind: "test", dedupeKey: `t:${Math.random()}`, recipient: "a@caedm.ca", subject: "S", html: "h", text: "t", createdAt: NOW })
        .returning()
    )[0].id;
  const row = async (id: number) => (await first(db.select().from(notifications).where(eq(notifications.id, id))))!;

  beforeEach(async () => {
    db = await testDb();
    sends = 0;
  });
  afterEach(() => setTransportOverride(null));

  it("claims a message once, so two senders racing deliver it a single time", async () => {
    setTransportOverride(transport(() => new Promise((r) => setTimeout(r, 50))));
    const id = await queue();
    await Promise.all([deliverNotification(id, db, NOW), deliverNotification(id, db, NOW), retryDeliveries(db, NOW + 120_000)]);
    expect(sends).toBe(1);
    expect(await row(id)).toMatchObject({ status: "sent", attempts: 1 });
  });

  it("never resends an unconfirmed message automatically, but allows a deliberate resend", async () => {
    setTransportOverride(
      transport(async () => {
        throw new UncertainDeliveryError("Delivery unconfirmed: no reply after DATA");
      }),
    );
    const id = await queue();
    await deliverNotification(id, db, NOW);
    expect(await row(id)).toMatchObject({ status: "unknown", nextAttemptAt: null });
    await retryDeliveries(db, NOW + 24 * 3600_000);
    expect(sends).toBe(1);

    setTransportOverride(transport(async () => {}));
    await expect(requeueUnconfirmed(id + 999, db)).rejects.toThrow(/unconfirmed/);
    await requeueUnconfirmed(id, db);
    await deliverNotification(id, db, NOW + 60_000);
    expect(await row(id)).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("retries a definite failure with backoff", async () => {
    let fail = true;
    setTransportOverride(
      transport(async () => {
        if (fail) throw new Error("421 Service not available");
      }),
    );
    const id = await queue();
    await deliverNotification(id, db, NOW);
    expect(await row(id)).toMatchObject({ status: "failed", nextAttemptAt: NOW + 60_000 });
    fail = false;
    await retryDeliveries(db, NOW + 61_000);
    expect(await row(id)).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("marks a send that was cut off mid-way as unconfirmed instead of sending it again", async () => {
    setTransportOverride(transport(async () => {}));
    const id = await queue();
    // Simulates a function stopped by the platform while talking to the mail server.
    await db.update(notifications).set({ status: "sending", claimedAt: NOW, attempts: 1 }).where(eq(notifications.id, id));
    await retryDeliveries(db, NOW + 60_000);
    expect((await row(id)).status).toBe("sending"); // still possibly in flight
    await retryDeliveries(db, NOW + STALE_CLAIM_MS + 1);
    expect(await row(id)).toMatchObject({ status: "unknown" });
    expect(sends).toBe(0);
  });

  it("sends a pending message nobody claimed (the request ended before sending)", async () => {
    setTransportOverride(transport(async () => {}));
    const id = await queue();
    await retryDeliveries(db, NOW + 61_000);
    expect(await row(id)).toMatchObject({ status: "sent" });
  });
});

describe("invitations: duplicate protection and link states", () => {
  let db: Awaited<ReturnType<typeof testDb>>;
  beforeEach(async () => {
    db = await testDb();
  });
  const invite = (opId?: string, now = NOW, email = "dana.new@caedm.ca") =>
    createInvitation({ email, name: "Dana New", role: "manager", invitedBy: null, opId }, db, now);

  it("repeating the same operation returns the first result and sends nothing more", async () => {
    const first1 = await invite(OP);
    const again = await invite(OP);
    expect(first1.duplicate).toBe(false);
    expect(again).toMatchObject({ duplicate: true, notificationId: first1.notificationId, inviteUrl: null });
    expect(await db.select().from(notifications)).toHaveLength(1);
    expect(await db.select().from(invitations)).toHaveLength(1);
  });

  it("two identical requests in flight at once create one invitation", async () => {
    const results = await Promise.all([invite(OP), invite(OP)]);
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(await db.select().from(notifications)).toHaveLength(1);
    expect(await db.select().from(invitations)).toHaveLength(1);
  });

  it("refuses a second invitation to the same person within 2 minutes, then allows it", async () => {
    await invite(OP);
    await expect(invite(OP2, NOW + 30_000)).rejects.toThrow(/less than 2 minutes ago/);
    const later = await invite(OP2, NOW + INVITE_REPEAT_GUARD_MS + 1);
    expect(later.duplicate).toBe(false);
    // The newer invitation replaces the older link.
    const token1 = (await db.select().from(invitations)).find((i) => i.revokedAt);
    expect(token1).toBeTruthy();
  });

  it("explains each link state: valid, replaced, expired, used and invalid", async () => {
    const a = await invite(OP);
    const tokenA = a.inviteUrl!.split("/invite/")[1];
    expect((await inspectInvitation(tokenA, db, NOW)).state).toBe("valid");
    expect((await inspectInvitation(tokenA, db, NOW + 73 * 3600_000)).state).toBe("expired");
    const b = await invite(OP2, NOW + INVITE_REPEAT_GUARD_MS + 1);
    expect((await inspectInvitation(tokenA, db, NOW + INVITE_REPEAT_GUARD_MS + 2)).state).toBe("replaced");
    const tokenB = b.inviteUrl!.split("/invite/")[1];
    await db.update(invitations).set({ acceptedAt: NOW }).where(eq(invitations.email, "dana.new@caedm.ca"));
    expect((await inspectInvitation(tokenB, db, NOW)).state).toBe("used");
    expect((await inspectInvitation("not-a-real-token-value-at-all", db, NOW)).state).toBe("invalid");
    expect((await inspectInvitation("../../etc", db, NOW)).state).toBe("invalid");
  });

  it("refuses to email links pointing at localhost in production", () => {
    const saved = { NODE_ENV: process.env.NODE_ENV, APP_URL: process.env.APP_URL };
    try {
      Object.assign(process.env, { NODE_ENV: "production", APP_URL: "http://localhost:3000" });
      resetEnvCache();
      expect(() => publicAppUrl()).toThrow(/APP_URL/);
      Object.assign(process.env, { APP_URL: "https://caedm-news-desk.vercel.app/" });
      resetEnvCache();
      expect(publicAppUrl()).toBe("https://caedm-news-desk.vercel.app");
    } finally {
      Object.assign(process.env, saved);
      if (saved.APP_URL === undefined) delete process.env.APP_URL;
      resetEnvCache();
    }
  });
});

describe("Send me a brief now: duplicate protection", () => {
  it("returns the first result for a repeated click and refuses a new one within a minute", async () => {
    const db = await testDb();
    const [u] = await db.insert(users).values({ email: "reader@caedm.ca", name: "Reader", status: "active" }).returning();
    const one = await sendBriefNow(u.id, db, NOW, { opId: OP });
    const same = await sendBriefNow(u.id, db, NOW + 5_000, { opId: OP });
    expect(same).toMatchObject({ duplicate: true, notificationId: one.notificationId });
    await expect(sendBriefNow(u.id, db, NOW + 10_000, { opId: OP2 })).rejects.toThrow(/just sent/);
    expect((await sendBriefNow(u.id, db, NOW + BRIEF_NOW_GUARD_MS + 1, { opId: OP2 })).duplicate).toBe(false);
    expect(await db.select().from(notifications).where(eq(notifications.kind, "brief"))).toHaveLength(2);
  });
});
