import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "../../auth/permissions";
import type { Priority, Role } from "../../db/schema";
import { formatDateTime, formatLongDate, formatTime } from "../../time";
import { COLORS, emailButton, emailLayout, esc, FONT, priorityPill, reviewPill, safeHref } from "./layout";

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
  /** Set for a personal brief: addressed to one person, with only their follow-ups. */
  personal?: { name: string; scope: "catholic" | "all"; scheduleLabel: string };
}): RenderedEmail {
  const date = formatLongDate(opts.now);
  const p = opts.personal;
  const subject = p ? `Your CAEDM News Brief | ${date}` : `CAEDM Morning News Brief | ${date}`;
  const scopeNote = p ? (p.scope === "catholic" ? " from Catholic sources" : " from all monitored sources") : "";
  const count = opts.totalStories ? `${opts.totalStories} new ${opts.totalStories === 1 ? "story" : "stories"}` : "No new stories";
  const intro = `${p ? `<p style="font-size:15px;margin:16px 0 0">Hello ${esc(p.name)},</p>` : ""}<p style="font-size:14px;color:${COLORS.muted};margin:${p ? "6px" : "16px"} 0 4px">${count}${scopeNote} since ${esc(formatDateTime(opts.windowStart))} (Edmonton time).</p>`;
  const nonEmpty = opts.sections.filter((s) => s.stories.length);
  const sectionsHtml = nonEmpty.length
    ? nonEmpty
        .map(
          (
            sec,
            i,
          ) => `<h2 style="font-family:${FONT};font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;color:${COLORS.goldText};padding-bottom:4px;border-bottom:2px solid ${COLORS.gold};margin:24px 0 4px">${i + 1}. ${esc(sec.title)}</h2>
${sec.note ? `<div style="font-size:12px;color:${COLORS.muted}">${esc(sec.note)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sec.stories.map((s) => storyHtml(s, sec.key === "top", opts.appUrl)).join("")}</table>
${sec.more ? `<div style="font-size:12px;color:${COLORS.muted};margin-top:6px">+ ${sec.more} more in the <a href="${safeHref(`${opts.appUrl}/news`)}" style="color:${COLORS.accent}">News Feed</a></div>` : ""}`,
        )
        .join("")
    : `<div style="margin:24px 0;padding:20px;border:1px dashed ${COLORS.border};border-radius:8px;text-align:center;color:${COLORS.muted};font-size:14px">No new stories from monitored sources since the last briefing.</div>`;
  const fuHtml = `<h2 style="font-family:${FONT};font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;color:${COLORS.goldText};padding-bottom:4px;border-bottom:2px solid ${COLORS.gold};margin:28px 0 4px">${p ? "Your follow-ups" : "Outstanding Communications follow-ups"}</h2>
${
  opts.followUps.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${opts.followUps
        .map(
          (f) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${COLORS.border};font-size:14px">
<a href="${safeHref(f.url)}" style="color:${COLORS.accent};text-decoration:none;font-weight:600">${esc(f.title)}</a>
<div style="font-size:12px;color:${f.overdue ? COLORS.P0 : COLORS.muted}">${esc(f.assignee ?? "Unassigned")} · ${esc(f.status)} · ${f.dueAt ? `Due ${esc(formatDateTime(f.dueAt))}${f.overdue ? " (overdue)" : ""}` : "No due date"}</div></td></tr>`,
        )
        .join("")}</table>`
    : `<div style="font-size:14px;color:${COLORS.muted}">${p ? "Nothing is assigned to you." : "No outstanding follow-ups."}</div>`
}`;
  const settingsUrl = `${opts.appUrl}/notifications#brief`;
  const html = emailLayout({
    title: p ? `Your News Brief — ${date}` : `Morning News Brief — ${date}`,
    preheader: opts.totalStories ? `${opts.totalStories} new stories${p ? scopeNote : " for Communications review"}` : "No new stories today",
    body:
      intro +
      sectionsHtml +
      fuHtml +
      (p
        ? `<p style="font-size:12px;color:${COLORS.muted};margin:24px 0 0"><a href="${safeHref(settingsUrl)}" style="color:${COLORS.accent}">Change the time or content of this brief, or turn it off</a></p>`
        : ""),
    footerNote: p
      ? `Your personal brief (${p.scheduleLabel}, ${p.scope === "catholic" ? "Catholic news only" : "all monitored news"}), generated ${formatTime(opts.now)} America/Edmonton.`
      : `Scheduled daily briefing generated ${formatTime(opts.now)} America/Edmonton.`,
  });
  const text = [
    subject,
    "",
    ...(p ? [`Hello ${p.name},`, ""] : []),
    opts.totalStories
      ? `${opts.totalStories} new stories${scopeNote} since ${formatDateTime(opts.windowStart)}.`
      : "No new stories from monitored sources since the last briefing.",
    ...nonEmpty.flatMap((sec, i) => [
      "",
      `${i + 1}. ${sec.title.toUpperCase()}`,
      ...sec.stories.map(storyText),
      sec.more ? `  + ${sec.more} more in the News Feed` : "",
    ]),
    "",
    p ? "YOUR FOLLOW-UPS" : "OUTSTANDING FOLLOW-UPS",
    ...(opts.followUps.length
      ? opts.followUps.map(
          (f) =>
            `- ${f.title} — ${f.assignee ?? "Unassigned"}, ${f.status}${f.dueAt ? `, due ${formatDateTime(f.dueAt)}` : ""}${f.overdue ? " (OVERDUE)" : ""}`,
        )
      : [p ? "Nothing is assigned to you." : "No outstanding follow-ups."]),
    "",
    `CAEDM News Desk: ${opts.appUrl}`,
    ...(p ? [`Change or turn off this brief: ${settingsUrl}`] : []),
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
    footerNote: "Alerts are sent only for qualifying P0/P1 items. Everything else appears in news briefs.",
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

export function renderInvite(opts: {
  name: string;
  email: string;
  inviteUrl: string;
  role: Role;
  invitedBy: string;
  expiresAt: number;
  appUrl: string;
  support: { name: string; email: string };
}): RenderedEmail {
  const subject = "Your invitation to join CAEDM News Desk";
  const greeting = opts.name ? `Dear ${opts.name},` : "Hello,";
  const role = ROLE_LABELS[opts.role];
  const expires = `${formatDateTime(opts.expiresAt)} (Edmonton time)`;
  const rows: [string, string][] = [
    ...(opts.name ? ([["Name", opts.name]] as [string, string][]) : []),
    ["Sign-in email", opts.email],
    ["Role", `${role}: ${ROLE_DESCRIPTIONS[opts.role]}`],
    ["Invited by", opts.invitedBy],
  ];
  const steps = [
    "Select <strong>Accept invitation</strong> below.",
    "Confirm your name and create a password of at least 12 characters.",
    `You're signed in straight away. Next time, sign in at <a href="${safeHref(opts.appUrl)}" style="color:${COLORS.accent}">${esc(opts.appUrl.replace(/^https?:\/\//, ""))}</a> with your work email.`,
  ];
  const p = "margin:0 0 14px 0;font-size:15px;line-height:1.6";
  const html = emailLayout({
    kind: "account",
    title: "You're invited to CAEDM News Desk",
    preheader: `${opts.invitedBy} invited you to join CAEDM News Desk as ${role}. Accept by ${formatDateTime(opts.expiresAt)}.`,
    body: `<p style="${p};margin-top:18px">${esc(greeting)}</p>
<p style="${p}">${esc(opts.invitedBy)} has invited you to join <strong>CAEDM News Desk</strong>, the Communications team's news-monitoring service for the Catholic Archdiocese of Edmonton. It gathers news from trusted Catholic and community sources, highlights what needs attention and can email you a daily news brief.</p>
${emailButton(opts.inviteUrl, "Accept invitation")}
${detailRows(rows)}
<p style="margin:18px 0 6px 0;font-size:14px;font-weight:bold">How to get started</p>
<ol style="margin:0 0 16px 0;padding-left:20px;font-size:14px;line-height:1.6">${steps.map((t) => `<li style="margin:2px 0">${t}</li>`).join("")}</ol>
<p style="margin:0 0 14px 0;font-size:13px;line-height:1.6;color:${COLORS.muted}"><strong style="color:${COLORS.ink}">This link expires ${esc(expires)}</strong> and works once. If it has expired, ask an administrator to send a new one. Not expecting this invitation? You can safely ignore it; no account is created until it is accepted.</p>
<p style="margin:0 0 18px 0;font-size:12px;line-height:1.5;color:${COLORS.muted}">Button not working? Copy this link into your browser:<br><a href="${safeHref(opts.inviteUrl)}" style="color:${COLORS.accent};word-break:break-all">${esc(opts.inviteUrl)}</a></p>
<p style="${p};font-size:14px">Questions? Contact ${esc(opts.support.name)} at <a href="mailto:${esc(opts.support.email)}" style="color:${COLORS.accent}">${esc(opts.support.email)}</a>.</p>
<p style="${p};font-size:14px;margin-bottom:0">With thanks,<br><strong>Communications</strong><br>Catholic Archdiocese of Edmonton</p>`,
  });
  const text = [
    greeting,
    "",
    `${opts.invitedBy} has invited you to join CAEDM News Desk, the Communications team's news-monitoring service for the Catholic Archdiocese of Edmonton.`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "To get started:",
    "1. Open the link below to accept the invitation.",
    "2. Confirm your name and create a password of at least 12 characters.",
    `3. You'll be signed in straight away. Next time, sign in at ${opts.appUrl} with your work email.`,
    "",
    opts.inviteUrl,
    "",
    `This link works once and expires ${expires}. Not expecting it? You can safely ignore this email.`,
    `Questions? Contact ${opts.support.name} at ${opts.support.email}.`,
    "",
    "Communications, Catholic Archdiocese of Edmonton",
  ].join("\n");
  return { subject, html, text };
}

function detailRows(rows: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;border:1px solid ${COLORS.border};border-radius:6px;font-family:${FONT};font-size:14px;line-height:1.5">${rows
    .map(
      ([k, v], i) =>
        `<tr><td valign="top" style="padding:8px 12px;width:34%;color:${COLORS.muted};${i ? `border-top:1px solid ${COLORS.border};` : ""}">${esc(k)}</td><td valign="top" style="padding:8px 12px;white-space:pre-wrap;color:${COLORS.ink};${i ? `border-top:1px solid ${COLORS.border};` : ""}">${esc(v)}</td></tr>`,
    )
    .join("")}</table>`;
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
    body: `${detailRows(rows)}${emailButton(`${opts.appUrl}/news/${opts.storyId}#follow-up`, "Open in News Desk")}<p style="font-size:13px"><a href="${safeHref(opts.storyUrl)}" style="color:${COLORS.accent}">Original source</a></p>`,
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
    body: `<p style="margin:18px 0 0 0">Someone asked to join CAEDM News Desk. Review it in Team management. No account exists until an administrator approves it.</p>${detailRows(rows)}${emailButton(`${opts.appUrl}/team`, "Review in Team management")}`,
    footerNote: "Sent to administrators with access-request emails turned on.",
  });
  const text = [subject, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `Review: ${opts.appUrl}/team`].join("\n");
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
    body: `<p style="margin:18px 0 0 0">Hello ${esc(opts.developerName)}, a News Desk user submitted a request.</p>${detailRows(rows)}${emailButton(`${opts.appUrl}/settings#feature-requests`, "View all requests")}`,
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
    body: `<p style="margin:18px 0 0 0">Your password for CAEDM News Desk was just changed.</p>${detailRows(rows)}<p style="margin:0;font-weight:bold">${esc(warning)}</p>${emailButton(`${opts.appUrl}/account`, "Open my account")}`,
    kind: "account",
    footerNote: "Security notices are always sent and can't be turned off.",
  });
  const text = [subject, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", warning, "", `${opts.appUrl}/account`].join("\n");
  return { subject, html, text };
}
