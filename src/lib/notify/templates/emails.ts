import type { Priority } from "../../db/schema";
import { formatDateTime, formatLongDate, formatTime } from "../../time";
import { COLORS, emailLayout, esc, priorityPill, reviewPill, safeHref } from "./layout";

export type EmailStory = {
  id: number;
  title: string;
  url: string;
  description: string | null;
  publisher: string;
  publishedAt: number | null;
  firstDetectedAt: number;
  priority: Priority;
  sensitive: boolean;
  verificationStatus: string;
  priorityReason?: string;
};

export type DigestSection = { key: string; title: string; note?: string; stories: EmailStory[]; more: number };

export type DigestFollowUp = { title: string; url: string; assignee: string | null; dueAt: number | null; status: string; overdue: boolean };

export type RenderedEmail = { subject: string; html: string; text: string };

function storyHtml(s: EmailStory, showPriority: boolean, appUrl: string) {
  const when = s.publishedAt ? formatDateTime(s.publishedAt) : `Detected ${formatDateTime(s.firstDetectedAt)}`;
  const flags = [
    showPriority || s.priority === "P0" || s.priority === "P1" ? priorityPill(s.priority) : "",
    s.sensitive ? reviewPill("Needs human review") : "",
    s.verificationStatus === "unverified" ? reviewPill("Unverified") : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<tr><td style="padding:12px 0;border-bottom:1px solid ${COLORS.border}">
${flags ? `<div style="margin-bottom:6px">${flags}</div>` : ""}
<a href="${safeHref(s.url)}" style="font-size:16px;font-weight:600;color:${COLORS.accent};text-decoration:none;line-height:1.35">${esc(s.title)}</a>
${s.description ? `<div style="font-size:14px;line-height:1.5;color:${COLORS.ink};margin-top:4px">${esc(s.description)} <span style="color:${COLORS.muted}">— ${esc(s.publisher)}</span></div>` : ""}
<div style="font-size:12px;color:${COLORS.muted};margin-top:6px">${esc(s.publisher)} · ${esc(when)} · <a href="${safeHref(s.url)}" style="color:${COLORS.accent}">Original source</a> · <a href="${safeHref(`${appUrl}/news/${s.id}`)}" style="color:${COLORS.muted}">News Desk</a></div>
</td></tr>`;
}

function storyText(s: EmailStory) {
  const when = s.publishedAt ? formatDateTime(s.publishedAt) : `detected ${formatDateTime(s.firstDetectedAt)}`;
  return [
    `- [${s.priority}]${s.sensitive ? " [NEEDS HUMAN REVIEW]" : ""} ${s.title}`,
    s.description ? `  ${s.description} (${s.publisher})` : null,
    `  ${s.publisher} · ${when}`,
    `  ${s.url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderDigest(opts: {
  now: number;
  sections: DigestSection[];
  followUps: DigestFollowUp[];
  windowStart: number;
  appUrl: string;
  totalStories: number;
}): RenderedEmail {
  const date = formatLongDate(opts.now);
  const subject = `CAEDM Morning News Brief | ${date}`;
  const intro = `<p style="font-size:14px;color:${COLORS.muted};margin:16px 0 4px">${opts.totalStories ? `${opts.totalStories} new ${opts.totalStories === 1 ? "story" : "stories"}` : "No new stories"} since ${esc(formatDateTime(opts.windowStart))} (Edmonton time).</p>`;
  const nonEmpty = opts.sections.filter((s) => s.stories.length);
  const sectionsHtml = nonEmpty.length
    ? nonEmpty
        .map(
          (
            sec,
            i,
          ) => `<h2 style="font-size:15px;text-transform:uppercase;letter-spacing:.05em;color:${COLORS.gold};margin:24px 0 4px">${i + 1}. ${esc(sec.title)}</h2>
${sec.note ? `<div style="font-size:12px;color:${COLORS.muted}">${esc(sec.note)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sec.stories.map((s) => storyHtml(s, sec.key === "top", opts.appUrl)).join("")}</table>
${sec.more ? `<div style="font-size:12px;color:${COLORS.muted};margin-top:6px">+ ${sec.more} more in the <a href="${safeHref(`${opts.appUrl}/news`)}" style="color:${COLORS.accent}">News Feed</a></div>` : ""}`,
        )
        .join("")
    : `<div style="margin:24px 0;padding:20px;border:1px dashed ${COLORS.border};border-radius:8px;text-align:center;color:${COLORS.muted};font-size:14px">No new stories from monitored sources since the last briefing.</div>`;
  const fuHtml = `<h2 style="font-size:15px;text-transform:uppercase;letter-spacing:.05em;color:${COLORS.gold};margin:28px 0 4px">Outstanding Communications follow-ups</h2>
${
  opts.followUps.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${opts.followUps
        .map(
          (f) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${COLORS.border};font-size:14px">
<a href="${safeHref(f.url)}" style="color:${COLORS.accent};text-decoration:none;font-weight:600">${esc(f.title)}</a>
<div style="font-size:12px;color:${f.overdue ? COLORS.P0 : COLORS.muted}">${esc(f.assignee ?? "Unassigned")} · ${esc(f.status)} · ${f.dueAt ? `Due ${esc(formatDateTime(f.dueAt))}${f.overdue ? " (overdue)" : ""}` : "No due date"}</div></td></tr>`,
        )
        .join("")}</table>`
    : `<div style="font-size:14px;color:${COLORS.muted}">No outstanding follow-ups.</div>`
}`;
  const html = emailLayout({
    title: `Morning News Brief — ${date}`,
    preheader: opts.totalStories ? `${opts.totalStories} new stories for Communications review` : "No new stories today",
    body: intro + sectionsHtml + fuHtml,
    footerNote: `Scheduled daily briefing generated ${formatTime(opts.now)} America/Edmonton.`,
  });
  const text = [
    subject,
    "",
    opts.totalStories
      ? `${opts.totalStories} new stories since ${formatDateTime(opts.windowStart)}.`
      : "No new stories from monitored sources since the last briefing.",
    ...nonEmpty.flatMap((sec, i) => [
      "",
      `${i + 1}. ${sec.title.toUpperCase()}`,
      ...sec.stories.map(storyText),
      sec.more ? `  + ${sec.more} more in the News Feed` : "",
    ]),
    "",
    "OUTSTANDING FOLLOW-UPS",
    ...(opts.followUps.length
      ? opts.followUps.map(
          (f) =>
            `- ${f.title} — ${f.assignee ?? "Unassigned"}, ${f.status}${f.dueAt ? `, due ${formatDateTime(f.dueAt)}` : ""}${f.overdue ? " (OVERDUE)" : ""}`,
        )
      : ["No outstanding follow-ups."]),
    "",
    `CAEDM News Desk: ${opts.appUrl}`,
  ].join("\n");
  return { subject, html, text };
}

export function renderAlert(opts: { now: number; stories: EmailStory[]; appUrl: string }): RenderedEmail {
  const top = opts.stories[0];
  const anySensitive = opts.stories.some((s) => s.sensitive || s.verificationStatus === "unverified");
  const highest = opts.stories.some((s) => s.priority === "P0") ? "P0" : "P1";
  const prefix = anySensitive ? "[INTERNAL REVIEW – UNVERIFIED] " : "";
  const subject =
    opts.stories.length === 1
      ? `${prefix}CAEDM ${highest} News Alert: ${top.title}`.slice(0, 200)
      : `${prefix}CAEDM ${highest} News Alert: ${opts.stories.length} high-priority stories`;
  const banner = anySensitive
    ? `<div style="margin:16px 0;padding:12px 14px;border:1px solid #fb923c;background:#fff7ed;border-radius:8px;font-size:13px;color:#7c2d12;line-height:1.5"><strong>Internal review alert.</strong> One or more items involve sensitive or unverified claims. They are reported here as headlines published by the named source, <strong>not as established facts</strong>. Verify before any response or external communication.</div>`
    : "";
  const body = `${banner}<p style="font-size:14px;color:${COLORS.muted};margin:16px 0 4px">High-priority ${opts.stories.length === 1 ? "development" : "developments"} detected ${esc(formatDateTime(opts.now))} (Edmonton time).</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${opts.stories
    .map(
      (s) =>
        storyHtml(s, true, opts.appUrl) +
        (s.priorityReason
          ? `<tr><td style="font-size:12px;color:${COLORS.muted};padding:0 0 10px">Why: ${esc(s.priorityReason.split("; ").slice(-2).join("; "))}</td></tr>`
          : ""),
    )
    .join("")}</table>`;
  const html = emailLayout({
    title: anySensitive ? "Internal Review Alert" : "High-Priority News Alert",
    preheader: top.title,
    body,
    footerNote: "Alerts are sent only for qualifying P0/P1 items. Everything else appears in the morning briefing.",
  });
  const text = [
    subject,
    "",
    anySensitive
      ? "INTERNAL REVIEW: sensitive or unverified claims are reported as published by the named source, not as established facts. Verify before responding.\n"
      : "",
    ...opts.stories.map(storyText),
    "",
    `CAEDM News Desk: ${opts.appUrl}`,
  ].join("\n");
  return { subject, html, text };
}

export function renderInvite(opts: { inviteUrl: string; role: string; invitedBy: string; expiresAt: number }): RenderedEmail {
  const subject = "Your invitation to CAEDM News Desk";
  const html = emailLayout({
    title: "You're invited to CAEDM News Desk",
    preheader: "Set up your account",
    body: `<p style="font-size:14px;line-height:1.6;margin-top:16px">${esc(opts.invitedBy)} invited you to CAEDM News Desk as <strong>${esc(opts.role === "admin" ? "Administrator" : "Communications")}</strong>.</p>
<p style="margin:20px 0"><a href="${safeHref(opts.inviteUrl)}" style="display:inline-block;padding:10px 18px;background:${COLORS.accent};color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Accept invitation</a></p>
<p style="font-size:12px;color:${COLORS.muted}">This single-use link expires ${esc(formatDateTime(opts.expiresAt))} (Edmonton time). If you were not expecting it, ignore this email.</p>`,
  });
  const text = `${subject}\n\n${opts.invitedBy} invited you as ${opts.role}.\nAccept: ${opts.inviteUrl}\nExpires ${formatDateTime(opts.expiresAt)}.`;
  return { subject, html, text };
}

function detailRows(rows: [string, string][]) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px;line-height:1.5">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:${COLORS.muted};vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0;white-space:pre-wrap">${esc(v)}</td></tr>`,
    )
    .join("")}</table>`;
}

function button(href: string, label: string) {
  return `<p style="margin:20px 0"><a href="${safeHref(href)}" style="display:inline-block;padding:10px 18px;background:${COLORS.accent};color:#fff;border-radius:6px;text-decoration:none;font-weight:600">${esc(label)}</a></p>`;
}

export function renderAssignment(opts: {
  storyTitle: string;
  storyUrl: string;
  storyId: number;
  priority: Priority;
  assignedBy: string;
  dueAt: number | null;
  note?: string | null;
  appUrl: string;
}): RenderedEmail {
  const subject = `Follow-up assigned to you: ${opts.storyTitle}`.slice(0, 200);
  const rows: [string, string][] = [
    ["Story", opts.storyTitle],
    ["Priority", opts.priority],
    ["Assigned by", opts.assignedBy],
    ["Due", opts.dueAt ? `${formatDateTime(opts.dueAt)} (Edmonton)` : "No due date"],
  ];
  if (opts.note) rows.push(["Note", opts.note]);
  const html = emailLayout({
    title: "Follow-up assigned to you",
    preheader: opts.storyTitle,
    body: `${detailRows(rows)}${button(`${opts.appUrl}/news/${opts.storyId}#follow-up`, "Open in News Desk")}<p style="font-size:13px"><a href="${safeHref(opts.storyUrl)}" style="color:${COLORS.accent}">Original source</a></p>`,
    footerNote: "You receive this because follow-up assignment emails are on in your account settings.",
  });
  const text = [subject, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `${opts.appUrl}/news/${opts.storyId}`].join("\n");
  return { subject, html, text };
}

export function renderAccessRequest(opts: {
  name: string;
  email: string;
  department: string;
  requestedRole: string;
  reason: string;
  createdAt: number;
  appUrl: string;
}): RenderedEmail {
  const subject = `Access request: ${opts.name} (${opts.email})`;
  const rows: [string, string][] = [
    ["Name", opts.name],
    ["Work email", opts.email],
    ["Department / role", opts.department || "—"],
    ["Requested access", opts.requestedRole],
    ["Reason", opts.reason || "—"],
    ["Received", `${formatDateTime(opts.createdAt)} (Edmonton)`],
  ];
  const html = emailLayout({
    title: "New access request",
    preheader: `${opts.name} wants to join CAEDM News Desk`,
    body: `<p style="font-size:14px;margin-top:16px">Someone asked to join CAEDM News Desk. Review the request on your dashboard. No account exists until an administrator approves it.</p>${detailRows(rows)}${button(`${opts.appUrl}/`, "Review on dashboard")}`,
    footerNote: "Sent to administrators with access-request emails turned on.",
  });
  const text = [subject, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `Review: ${opts.appUrl}/`].join("\n");
  return { subject, html, text };
}

export function renderFeatureRequest(opts: {
  id: number;
  title: string;
  description: string;
  category: string;
  importance: string;
  requester: string;
  page: string | null;
  createdAt: number;
  developerName: string;
  appUrl: string;
}): RenderedEmail {
  const subject = `[CAEDM News Desk] Feature request #${opts.id}: ${opts.title}`.slice(0, 200);
  const rows: [string, string][] = [
    ["Request", `#${opts.id}`],
    ["Title", opts.title],
    ["Type", opts.category],
    ["Importance", opts.importance],
    ["From", opts.requester],
    ["Page", opts.page ?? "—"],
    ["Submitted", `${formatDateTime(opts.createdAt)} (Edmonton)`],
    ["Details", opts.description],
  ];
  const html = emailLayout({
    title: "Feature request",
    preheader: opts.title,
    body: `<p style="font-size:14px;margin-top:16px">Hello ${esc(opts.developerName)}, a News Desk user submitted a request.</p>${detailRows(rows)}${button(`${opts.appUrl}/settings#feature-requests`, "View all requests")}`,
    footerNote: "Reply to the requester directly at the address above.",
  });
  const text = [subject, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `${opts.appUrl}/settings#feature-requests`].join("\n");
  return { subject, html, text };
}

export function renderPasswordChanged(opts: {
  name: string;
  when: number;
  otherSessionsEnded: number;
  appUrl: string;
  supportEmail: string;
}): RenderedEmail {
  const subject = "Your News Desk password was changed";
  const rows: [string, string][] = [
    ["Account", opts.name],
    ["Changed", `${formatDateTime(opts.when)} (Edmonton)`],
    ["Other sessions signed out", String(opts.otherSessionsEnded)],
  ];
  const warning = `If you didn't make this change, contact ${opts.supportEmail} immediately.`;
  const html = emailLayout({
    title: "Password changed",
    preheader: subject,
    body: `<p style="font-size:14px">Your password for CAEDM News Desk was just changed.</p>${detailRows(rows)}<p style="font-size:14px;font-weight:600">${esc(warning)}</p>${button(`${opts.appUrl}/account`, "Open my account")}`,
    footerNote: "Security notices are always sent and can't be turned off.",
  });
  const text = [subject, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", warning, "", `${opts.appUrl}/account`].join("\n");
  return { subject, html, text };
}
