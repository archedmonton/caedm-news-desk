import nodemailer from "nodemailer";
import { env } from "../env";

export type OutgoingEmail = { to: string; subject: string; html: string; text: string; replyTo?: string };

export interface MailTransport {
  name: string;
  send(msg: OutgoingEmail): Promise<{ messageId?: string }>;
}

/** Why live delivery is (un)available. Never exposes secret values. */
export function liveEmailStatus(): { live: boolean; transport: string; reason: string } {
  const e = env();
  if (!e.EMAIL_LIVE_SEND) return { live: false, transport: e.EMAIL_TRANSPORT, reason: "EMAIL_LIVE_SEND is not enabled — messages are simulated in the outbox." };
  if (e.EMAIL_TRANSPORT === "outbox") return { live: false, transport: "outbox", reason: "EMAIL_TRANSPORT=outbox — no live transport selected." };
  if (e.EMAIL_TRANSPORT === "smtp" && !e.SMTP_HOST) return { live: false, transport: "smtp", reason: "SMTP_HOST is not configured." };
  if (e.EMAIL_TRANSPORT === "graph" && !(e.GRAPH_TENANT_ID && e.GRAPH_CLIENT_ID && e.GRAPH_CLIENT_SECRET && e.GRAPH_SENDER)) {
    return { live: false, transport: "graph", reason: "Microsoft Graph credentials are incomplete." };
  }
  return { live: true, transport: e.EMAIL_TRANSPORT, reason: `Live delivery via ${e.EMAIL_TRANSPORT}.` };
}

function smtpTransport(): MailTransport {
  const e = env();
  const t = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT ?? 587,
    secure: e.SMTP_SECURE,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
  });
  return {
    name: "smtp",
    async send(msg) {
      const info = await t.sendMail({ from: e.EMAIL_FROM, ...msg });
      return { messageId: info.messageId };
    },
  };
}

/** Microsoft Graph sendMail via client-credentials app registration (Mail.Send, scoped to one mailbox). */
function graphTransport(): MailTransport {
  const e = env();
  let token: { value: string; exp: number } | null = null;
  async function getToken() {
    if (token && token.exp > Date.now() + 60_000) return token.value;
    const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(e.GRAPH_TENANT_ID!)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: e.GRAPH_CLIENT_ID!,
        client_secret: e.GRAPH_CLIENT_SECRET!,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Graph token request failed: HTTP ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 };
    return token.value;
  }
  return {
    name: "graph",
    async send(msg) {
      const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(e.GRAPH_SENDER!)}/sendMail`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: msg.subject,
            body: { contentType: "HTML", content: msg.html },
            toRecipients: msg.to.split(",").map((a) => ({ emailAddress: { address: a.trim() } })),
          ...(msg.replyTo ? { replyTo: [{ emailAddress: { address: msg.replyTo } }] } : {}),
          },
          saveToSentItems: true,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`Graph sendMail failed: HTTP ${res.status}`);
      return {};
    },
  };
}

let override: MailTransport | null = null;
/** Test hook. */
export function setTransportOverride(t: MailTransport | null) {
  override = t;
}

/** Returns a live transport, or null when messages must only be simulated. */
export function getLiveTransport(): MailTransport | null {
  if (override) return override;
  const status = liveEmailStatus();
  if (!status.live) return null;
  return env().EMAIL_TRANSPORT === "smtp" ? smtpTransport() : graphTransport();
}
