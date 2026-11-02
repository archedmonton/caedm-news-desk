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
  if (!e.EMAIL_LIVE_SEND)
    return { live: false, transport: e.EMAIL_TRANSPORT, reason: "EMAIL_LIVE_SEND is not enabled — messages are simulated in the outbox." };
  if (e.EMAIL_TRANSPORT === "outbox") return { live: false, transport: "outbox", reason: "EMAIL_TRANSPORT=outbox — no live transport selected." };
  if (e.EMAIL_TRANSPORT === "smtp" && !e.SMTP_HOST) return { live: false, transport: "smtp", reason: "SMTP_HOST is not configured." };
  if (e.EMAIL_TRANSPORT === "graph" && !(e.GRAPH_TENANT_ID && e.GRAPH_CLIENT_ID && e.GRAPH_CLIENT_SECRET && e.GRAPH_SENDER)) {
    return { live: false, transport: "graph", reason: "Microsoft Graph credentials are incomplete." };
  }
  return { live: true, transport: e.EMAIL_TRANSPORT, reason: `Live delivery via ${e.EMAIL_TRANSPORT}.` };
}

/**
 * The provider may have accepted the message, but we never got its confirmation (e.g. a timeout after the
 * message data was sent). Never retried automatically: retrying could deliver a second copy.
 */
export class UncertainDeliveryError extends Error {
  readonly uncertain = true;
}

export const isUncertainDelivery = (e: unknown): e is UncertainDeliveryError => e instanceof UncertainDeliveryError;

/**
 * Hard ceiling for one send, kept under the 60 s function limit of the pages that send email. Exchange can hold
 * its final "250 Queued" reply for up to 30 s (delayed acknowledgement), so the socket timeout allows for that.
 */
export const SEND_DEADLINE_MS = 45_000;

function withDeadline<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(onTimeout()), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
  /** Overridable for tests against a local fake server. */
  socketTimeoutMs?: number;
  deadlineMs?: number;
};

function smtpTransport(): MailTransport {
  const e = env();
  return createSmtpTransport({
    host: e.SMTP_HOST!,
    port: e.SMTP_PORT ?? 587,
    secure: e.SMTP_SECURE,
    user: e.SMTP_USER,
    password: e.SMTP_PASSWORD,
    from: e.EMAIL_FROM,
  });
}

export function createSmtpTransport(c: SmtpConfig): MailTransport {
  const deadline = c.deadlineMs ?? SEND_DEADLINE_MS;
  return {
    name: "smtp",
    async send(msg) {
      // Once DATA is sent the server may queue the message even if its reply never reaches us.
      let dataSent = false;
      const quiet = () => {};
      const t = nodemailer.createTransport({
        host: c.host,
        port: c.port,
        secure: c.secure,
        auth: c.user ? { user: c.user, pass: c.password } : undefined,
        connectionTimeout: Math.min(10_000, deadline),
        greetingTimeout: Math.min(10_000, deadline),
        socketTimeout: c.socketTimeoutMs ?? 40_000,
        // Only client command names are inspected (AUTH lines are masked by nodemailer); nothing is logged.
        transactionLog: true,
        logger: {
          trace: quiet,
          info: quiet,
          warn: quiet,
          error: quiet,
          fatal: quiet,
          debug: (entry: { tnx?: string }, line: unknown) => {
            if (entry?.tnx === "client" && /^DATA\b/i.test(String(line))) dataSent = true;
          },
        },
      });
      try {
        const info = await withDeadline(
          t.sendMail({ from: c.from, ...msg }),
          deadline,
          () => new Error(`No reply from the mail server within ${deadline / 1000} s`),
        );
        return { messageId: info.messageId };
      } catch (err) {
        const code = (err as { responseCode?: number }).responseCode;
        // An explicit 4xx/5xx reply means the server refused the message: safe to retry.
        if (dataSent && !(code && code >= 400)) {
          throw new UncertainDeliveryError(`Delivery unconfirmed: the mail server received the message but did not confirm it (${(err as Error).message}).`);
        }
        throw err;
      } finally {
        t.close();
      }
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
      }).catch((err: Error) => {
        // The request may have reached Graph before the connection failed.
        throw new UncertainDeliveryError(`Delivery unconfirmed: no response from Microsoft Graph (${err.message}).`);
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
