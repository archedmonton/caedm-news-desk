import { env } from "../../env";

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) links are emitted; anything else becomes "#". */
export function safeHref(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? esc(u.toString()) : "#";
  } catch {
    return "#";
  }
}

export const COLORS = {
  ink: "#1f2937",
  muted: "#6b7280",
  border: "#e5e7eb",
  accent: "#860038",
  gold: "#e5c047",
  bg: "#f8f6f4",
  P0: "#bf311a",
  P1: "#b45309",
  P2: "#005493",
  P3: "#6b7280",
} as const;

export function priorityPill(p: "P0" | "P1" | "P2" | "P3") {
  const label = { P0: "P0 Critical", P1: "P1 High", P2: "P2 Standard", P3: "P3 Background" }[p];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${COLORS[p]}">${label}</span>`;
}

export function reviewPill(text: string) {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#7c2d12;background:#fed7aa;border:1px solid #fb923c">${esc(text)}</span>`;
}

/** `account` emails (invitations, security notices) carry no news, so they skip the news attribution note. */
export function emailLayout(opts: { title: string; preheader: string; body: string; footerNote?: string; kind?: "news" | "account" }) {
  const appUrl = env().APP_URL;
  const note =
    opts.kind === "account"
      ? "This message was sent by CAEDM News Desk, the Communications team's internal news-monitoring service."
      : "Summaries are the publishers' own descriptions, attributed to each source. Always confirm details on the original page before sharing.";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COLORS.ink}">
<div style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid ${COLORS.border};border-radius:10px">
<tr><td style="padding:18px 28px 14px 28px;border-radius:10px 10px 0 0"><img src="${safeHref(`${appUrl}/caedm-logo.png`)}" width="155" height="72" alt="The Catholic Archdiocese of Edmonton" style="display:block;border:0;height:auto;max-width:155px;font-size:14px;font-weight:700;color:${COLORS.accent}"></td></tr>
<tr><td style="padding:22px 28px;border-bottom:3px solid ${COLORS.gold};background:${COLORS.accent}">
<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#f5dbe5">Catholic Archdiocese of Edmonton · Communications</div>
<div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:4px">${esc(opts.title)}</div>
</td></tr>
<tr><td style="padding:8px 28px 24px 28px">${opts.body}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid ${COLORS.border};font-size:12px;color:${COLORS.muted};line-height:1.5">
${opts.footerNote ? `${esc(opts.footerNote)}<br>` : ""}${note}<br>
Internal use only. <a href="${safeHref(appUrl)}" style="color:${COLORS.accent}">Open CAEDM News Desk</a>
</td></tr></table></td></tr></table></body></html>`;
}
