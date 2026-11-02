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
  muted: "#5b6472",
  border: "#e5e7eb",
  accent: "#860038",
  gold: "#e5c047",
  /** Gold dark enough for text on white (the bright gold is only for rules and accents). */
  goldText: "#7a5c00",
  bg: "#f4f4f5",
  P0: "#bf311a",
  P1: "#b45309",
  P2: "#005493",
  P3: "#5b6472",
} as const;

export const FONT = "Arial,'Segoe UI',Helvetica,sans-serif";

const PILL_TINT = { P0: "#fdecea", P1: "#fef3e2", P2: "#e6f0f8", P3: "#f1f2f4" } as const;

/**
 * Coloured text on a pale tint with a matching border, so the label stays readable even in clients that drop
 * span backgrounds or invert colours.
 */
export function priorityPill(p: "P0" | "P1" | "P2" | "P3") {
  const label = { P0: "P0 Critical", P1: "P1 High", P2: "P2 Standard", P3: "P3 Background" }[p];
  return `<span style="display:inline-block;padding:2px 8px;border:1px solid ${COLORS[p]};border-radius:999px;font-size:11px;font-weight:700;color:${COLORS[p]};background-color:${PILL_TINT[p]}">${label}</span>`;
}

export function reviewPill(text: string) {
  return `<span style="display:inline-block;padding:2px 8px;border:1px solid #c2410c;border-radius:999px;font-size:11px;font-weight:700;color:#7c2d12;background-color:#ffedd5">${esc(text)}</span>`;
}

/**
 * "Bulletproof" button: the colour sits on a table cell (`bgcolor`), which Outlook desktop renders, rather than
 * on the link, which it ignores. A background on the link alone left white text on a white page.
 */
export function emailButton(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0"><tr>
<td align="center" bgcolor="${COLORS.accent}" style="background-color:${COLORS.accent};border-radius:6px;mso-padding-alt:12px 24px">
<a href="${safeHref(href)}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:bold;line-height:20px;color:#ffffff;text-decoration:none;border-radius:6px">${esc(label)}</a>
</td></tr></table>`;
}

/**
 * Shared frame for every email: white card, logo, gold rule, title, body and footer. Table layout with inline
 * styles only, no web fonts or CSS variables, and dark text on light backgrounds so nothing depends on a
 * coloured background rendering. `account` emails (invitations, security notices) carry no news, so they skip
 * the news attribution note.
 */
export function emailLayout(opts: { title: string; preheader: string; body: string; footerNote?: string; kind?: "news" | "account" }) {
  const appUrl = env().APP_URL;
  const note =
    opts.kind === "account"
      ? "This message was sent by CAEDM News Desk, the Communications team's internal news-monitoring service."
      : "Summaries are the publishers' own descriptions, attributed to each source. Always confirm details on the original page before sharing.";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};font-family:${FONT};color:${COLORS.ink};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.bg}" style="background-color:${COLORS.bg}"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:600px;background-color:#ffffff;border:1px solid ${COLORS.border};border-radius:8px">
<tr><td style="padding:24px 32px 18px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><img src="${safeHref(`${appUrl}/caedm-logo-email.png`)}" width="140" height="69" alt="The Catholic Archdiocese of Edmonton" style="display:block;border:0;width:140px;max-width:140px;height:auto;font-family:${FONT};font-size:14px;font-weight:bold;color:${COLORS.accent}"></td>
<td valign="middle" align="right" style="font-family:${FONT};font-size:12px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;color:${COLORS.accent}">News Desk</td>
</tr></table></td></tr>
<tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="3" bgcolor="${COLORS.gold}" style="height:3px;background-color:${COLORS.gold};font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:24px 32px 0 32px;font-family:${FONT}">
<div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${COLORS.muted}">Catholic Archdiocese of Edmonton · Communications</div>
<h1 style="margin:6px 0 0 0;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:bold;color:${COLORS.accent}">${esc(opts.title)}</h1>
</td></tr>
<tr><td style="padding:4px 32px 28px 32px;font-family:${FONT};font-size:14px;line-height:1.6;color:${COLORS.ink}">${opts.body}</td></tr>
<tr><td bgcolor="#fafafa" style="padding:18px 32px;border-top:1px solid ${COLORS.border};background-color:#fafafa;border-radius:0 0 8px 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:${COLORS.muted}">
${opts.footerNote ? `${esc(opts.footerNote)}<br>` : ""}${note}<br>
Internal use only · <a href="${safeHref(appUrl)}" style="color:${COLORS.accent};text-decoration:underline">Open CAEDM News Desk</a>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}
