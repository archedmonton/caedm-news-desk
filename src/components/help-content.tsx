import type * as React from "react";

export type Section = { title: string; body: React.ReactNode };

const List = ({ children }: { children: React.ReactNode }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>;

const ABOUT: Section = {
  title: "About CAEDM News Desk",
  body: (
    <p>
      News Desk watches approved Catholic and Edmonton news sources for the Archdiocese&apos;s Communications team. It ranks stories by importance,
      sends each person their own news brief at the time they choose, alerts on urgent stories, and tracks follow-ups so nothing is missed. Every
      email goes to the signed-in person&apos;s own work address.
    </p>
  ),
};

const PRIORITIES: Section = {
  title: "What the priorities mean",
  body: (
    <List>
      <li>
        <strong>P0 Critical</strong>: serious, time-sensitive developments directly involving the Archdiocese or a local Catholic institution. Alerts
        are sent immediately.
      </li>
      <li>
        <strong>P1 High</strong>: important local Catholic, education, healthcare or policy news that needs timely review. Alerts are sent during
        alert hours.
      </li>
      <li>
        <strong>P2 Standard</strong>: relevant community news, events and routine announcements, included in news briefs.
      </li>
      <li>
        <strong>P3 Background</strong>: context, including routine international news.
      </li>
    </List>
  ),
};

/** Topics opened by the small help icons next to individual features. */
const TOPICS = {
  priorities: PRIORITIES,
  "personal-brief": {
    title: "Your personal news brief",
    body: (
      <List>
        <li>A summary of new stories, emailed to you at the time and on the days you choose (Edmonton time).</li>
        <li>
          <strong>Catholic news only</strong> includes the Archdiocese, Catholic partners, Canadian Catholic and Vatican sources.{" "}
          <strong>All monitored news</strong> adds government and other sources.
        </li>
        <li>Each brief covers the news since your previous one, so nothing is skipped or repeated. Weekday briefs on Monday cover the weekend.</li>
        <li>If nothing new was published, no email is sent that day.</li>
        <li>It also lists the follow-ups assigned to you.</li>
        <li>It may arrive up to 15 minutes after the time you pick.</li>
      </List>
    ),
  },
  "send-now": {
    title: "Send me a brief now",
    body: (
      <p>
        Builds your personal brief from the last 24 hours, using your <em>Catholic news only</em> or <em>All monitored news</em> choice, and emails it
        to you right away. It doesn&apos;t affect your scheduled brief. You can send one per minute.
      </p>
    ),
  },
  "my-alerts": {
    title: "Your high-priority alerts",
    body: (
      <List>
        <li>Separate emails for urgent stories, sent to your own work email only if you turn them on.</li>
        <li>
          <strong>P0 Critical and P1 High</strong>: every alert. <strong>P0 Critical only</strong>: just the most serious. <strong>Off</strong>: check
          the dashboard instead.
        </li>
        <li>Alerts follow the shared alert hours and limits set by administrators. P0 may be allowed at any time.</li>
      </List>
    ),
  },
  "alert-rules": {
    title: "Rules for everyone (administrators)",
    body: (
      <List>
        <li>These rules apply to everyone; there is no shared mailbox. Each person chooses what they receive at their own address.</li>
        <li>
          <strong>Default brief time</strong> is used by people who don&apos;t pick their own. <strong>Lookback</strong> is the shortest period a
          brief covers.
        </li>
        <li>
          <strong>Alert hours</strong> and the hourly and daily <strong>limits</strong> stop alert floods. Stories held back stay on the dashboard
          and appear in the next brief.
        </li>
      </List>
    ),
  },
  "email-status": {
    title: "What the delivery statuses mean",
    body: (
      <List>
        <li>
          <strong>Sent</strong>: delivered to the mail server.
        </li>
        <li>
          <strong>Simulated</strong>: stored here only; live email is off, so nothing was sent.
        </li>
        <li>
          <strong>Failed</strong>: the mail server couldn&apos;t be reached. It retries automatically after 1, 5, 15 and 60 minutes. Managers can
          also choose <strong>Retry now</strong>.
        </li>
        <li>
          <strong>Sending</strong>: being handed to the mail server now, usually within a few seconds.
        </li>
        <li>
          <strong>Unconfirmed</strong>: the mail server received the message but never confirmed it, so it may or may not have arrived. It is not
          resent automatically, to avoid a duplicate. Check with the recipient; a manager can then choose <strong>Resend anyway</strong>.
        </li>
        <li>
          <strong>Skipped</strong>: deliberately not sent, for example a personal brief on a day with nothing new.
        </li>
      </List>
    ),
  },
  "news-filters": {
    title: "Searching and filtering",
    body: (
      <List>
        <li>Search looks in headlines and the publisher&apos;s summaries. Choose filters, then press <strong>Apply</strong>.</li>
        <li>
          By default the feed hides <strong>archived</strong> stories. Choose <em>Archived</em> in the status list to see them.
        </li>
        <li>
          <strong>Newest first</strong> sorts by the publisher&apos;s date; <strong>Recently detected</strong> by when News Desk found the story.
        </li>
        <li>
          <strong>Needs review only</strong> shows sensitive or unverified stories.
        </li>
        <li>Dates are Edmonton dates. If nothing matches, widen the dates or press <strong>Clear</strong>.</li>
      </List>
    ),
  },
  "submit-link": {
    title: "Submitting a link",
    body: (
      <List>
        <li>For a story from a website News Desk doesn&apos;t monitor, such as a newspaper article someone sent you.</li>
        <li>
          News Desk reads only the page&apos;s headline and short description, and only if the site allows it. If it can&apos;t, type the headline
          yourself.
        </li>
        <li>Keep the summary to one or two factual sentences in your own words; don&apos;t paste the article.</li>
        <li>
          Submitted stories are marked <strong>Unverified</strong> until someone checks them, and are classified like any other story.
        </li>
      </List>
    ),
  },
  "priority-reason": {
    title: "Why a story got its priority",
    body: (
      <List>
        <li>
          Priorities come from keyword rules, not AI. Each matching rule adds points; the list shows every rule that matched and the points it
          added.
        </li>
        <li>
          The total <strong>score</strong> decides P1, P2 or P3. P0 needs a specific urgent rule, such as an urgent development directly involving
          the Archdiocese.
        </li>
        <li>
          If the priority looks wrong, a manager can change it in <strong>Change priority</strong>. Administrators can adjust the rules in
          Settings.
        </li>
      </List>
    ),
  },
  "change-priority": {
    title: "Changing a story's priority",
    body: (
      <List>
        <li>Choose the right priority and give a short reason. The change and reason appear in the story&apos;s history.</li>
        <li>A manual priority is kept even when the rules are re-run. A dot (•) beside the priority shows it was set by hand.</li>
        <li>
          <strong>Restore automatic priority</strong> hands the story back to the rules.
        </li>
        <li>Raising a story to P0 or P1 can send an alert to people who have alerts turned on.</li>
      </List>
    ),
  },
  workflow: {
    title: "Story workflow",
    body: (
      <List>
        <li>
          <strong>New</strong>: just found. <strong>Mark reviewed</strong> moves it to <strong>Reviewing</strong>, meaning someone has looked at it.
        </li>
        <li>
          <strong>Assigned</strong>: someone is acting on it. A story becomes Assigned when you save a follow-up for it.
        </li>
        <li>
          <strong>Covered</strong>: Communications has acted. <strong>Archive</strong> when no action is needed; archived stories are hidden from
          the feed but never deleted.
        </li>
        <li>You can always reopen a covered or archived story.</li>
      </List>
    ),
  },
  "follow-up": {
    title: "Assigning a follow-up",
    body: (
      <List>
        <li>Choose a colleague, a due date and time (Edmonton time), and optionally a note saying what needs to happen.</li>
        <li>
          They receive an email about it unless they turned that off in <strong>Notifications &amp; alerts</strong>. It also appears in their news
          brief and under <strong>Follow-ups → Assigned to me</strong>.
        </li>
        <li>Past the due date, the follow-up is flagged as overdue.</li>
        <li>
          To finish, choose <strong>Mark covered</strong>. To hand it over, pick a different assignee and save again.
        </li>
        <li>Internal notes stay inside News Desk and are never emailed outside it.</li>
      </List>
    ),
  },
  verification: {
    title: "Needs review and Unverified",
    body: (
      <List>
        <li>
          <strong>Needs human review</strong>: the story touches a sensitive subject. Read the original before using it anywhere.
        </li>
        <li>
          <strong>Unverified</strong>: the story didn&apos;t come from the organization&apos;s own official channel, for example news media or a
          submitted link. Treat it as what the publisher reported, not as fact.
        </li>
        <li>
          After confirming the facts with the original source or the organization, choose <strong>Mark verified by staff</strong>. This is
          recorded with your name.
        </li>
      </List>
    ),
  },
  "source-health": {
    title: "Source health and checks",
    body: (
      <List>
        <li>
          <strong>Healthy</strong>: the last check worked. <strong>Degraded</strong>: one or two checks in a row failed.{" "}
          <strong>Failing</strong>: three or more in a row.
        </li>
        <li>
          <strong>Awaiting first check</strong>: new; the first check stores current stories without sending alerts, so you aren&apos;t flooded.
        </li>
        <li>A failing source is retried less often (up to every 6 hours) until it recovers. The other sources keep working.</li>
        <li>
          In <strong>Recent checks</strong>, <em>Found / new</em> is the number of items the source listed and how many were new to News Desk.
        </li>
        <li>
          Managers can choose <strong>Check now</strong>. If a source keeps failing, its website may have changed; tell an administrator.
        </li>
      </List>
    ),
  },
  "expansion-registry": {
    title: "Expansion registry",
    body: (
      <p>
        Organizations the team plans to monitor but hasn&apos;t connected yet. A source is only monitored once its official RSS or Atom feed has been
        found, tested and saved by an administrator, and its website allows automated reading. Choose <strong>Set up</strong> to start.
      </p>
    ),
  },
  "find-feed": {
    title: "Finding and testing a feed",
    body: (
      <List>
        <li>
          A news feed (RSS or Atom) is a machine-readable list of an organization&apos;s latest news. It&apos;s often linked as &ldquo;RSS&rdquo; on
          the news page, or found at an address ending in <code>/feed/</code>.
        </li>
        <li>
          Enter the website, then choose <strong>Find feed</strong>; News Desk reads the feed the site advertises. If there are several, pick the
          news one.
        </li>
        <li>
          <strong>Test</strong> shows the latest headlines, so you can check it&apos;s the right feed before saving.
        </li>
        <li>
          If no feed is found or the test fails, the site may not publish one, or its robots.txt may not allow automated reading. Ask the
          developer; News Desk never works around a website&apos;s rules.
        </li>
      </List>
    ),
  },
  "source-fields": {
    title: "Source details",
    body: (
      <List>
        <li>
          <strong>Organization type</strong> sets whether stories count as official. News media stories are marked <em>Unverified</em>.
        </li>
        <li>
          <strong>Area</strong> and <strong>Default category</strong> help rank and group stories.
        </li>
        <li>
          <strong>Importance</strong> (1 to 5) adds a few points to every story from this source. It never makes a story urgent on its own.
        </li>
        <li>
          <strong>Check every</strong> overrides how often this source is refreshed while staff are signed in. Leave it blank to use the default.
        </li>
        <li>
          To stop monitoring, untick <strong>Monitor this source</strong>. A source with stories can&apos;t be deleted, so its history is kept.
        </li>
      </List>
    ),
  },
  "email-mode": {
    title: "Simulated and live email",
    body: (
      <List>
        <li>
          <strong>Simulated</strong>: every email is created and stored in the Email outbox, but nothing leaves News Desk. This is the safe default.
        </li>
        <li>
          <strong>Live</strong>: emails are delivered through the Archdiocese&apos;s mail service. IT turns this on; it can&apos;t be changed from
          this page.
        </li>
        <li>Your notification choices are saved either way and take effect as soon as live email is on.</li>
      </List>
    ),
  },
  refresh: {
    title: "How sources are refreshed",
    body: (
      <List>
        <li>Every source is checked each morning before the 8 AM brief, whether or not anyone is signed in.</li>
        <li>While anyone is signed in, sources are also checked at this interval, and new stories appear with a banner.</li>
        <li>A shorter interval finds news sooner but sends more requests to publishers&apos; websites. 15 to 60 minutes is sensible.</li>
      </List>
    ),
  },
  "priority-rules": {
    title: "Editing the priority rules",
    body: (
      <List>
        <li>Each list holds words or phrases, one per line. A match adds points to a story&apos;s score; the lists for P0 triggers work directly.</li>
        <li>
          Matching ignores capitals and accents. <code>canoniz*</code> matches canonize, canonized and canonization. <code>^Pope</code> matches only
          at the start of a headline.
        </li>
        <li>
          A score at or above the <strong>High (P1) threshold</strong> can be P1; at or above the <strong>Standard (P2) threshold</strong> is P2;
          below is P3. P0 rules only apply to stories newer than the <strong>recency window</strong>.
        </li>
        <li>
          Leave <strong>Re-classify existing stories</strong> ticked to apply changes to stories already found. Priorities set by hand are kept.
        </li>
        <li>Make small changes, then check a few story pages under &ldquo;Why this priority&rdquo;.</li>
      </List>
    ),
  },
  inviting: {
    title: "Sending an invitation",
    body: (
      <List>
        <li>Enter the person&apos;s full name and work email and choose their role. You can change the role later.</li>
        <li>
          They get a personal email with a one-time link to create their password. The link works for 72 hours; until then they show as{" "}
          <em>Invited</em>.
        </li>
        <li>
          A line under the button shows whether the email was sent. If they didn&apos;t receive it, check <strong>Email outbox → Invitations</strong>
          , then send a new invitation; the new link replaces the old one.
        </li>
        <li>To withdraw an invitation, choose <strong>Cancel invite</strong>.</li>
      </List>
    ),
  },
  "staff-actions": {
    title: "Changing someone's access",
    body: (
      <List>
        <li>
          <strong>Role</strong>: choose a new role and press <strong>Save</strong>. It applies the next time they open a page.
        </li>
        <li>
          <strong>Disable</strong> signs them out and blocks access until you choose <strong>Re-enable</strong>. Nothing is lost.
        </li>
        <li>
          <strong>Delete</strong> removes the account permanently. Their follow-ups become unassigned; their notes and history are kept.
        </li>
        <li>
          <strong>Forgotten password?</strong> Choose <strong>Disable</strong>, then send them a new invitation from the form above. They create a new
          password and keep all their history.
        </li>
        <li>You can&apos;t change or delete your own account, and the developer account is protected.</li>
      </List>
    ),
  },
  "access-requests": {
    title: "Access requests",
    body: (
      <List>
        <li>People without an account can ask to join from the sign-in page. Only work email addresses are accepted.</li>
        <li>
          <strong>Approve</strong> sends them a normal invitation with the role you pick; you can choose a different role from the one they asked for.
        </li>
        <li>
          <strong>Decline</strong> closes the request. No email is sent, so let them know yourself if needed.
        </li>
        <li>Check the person and their department before approving. News Desk shows what they typed and doesn&apos;t verify it.</li>
      </List>
    ),
  },
  "alert-dry-run": {
    title: "Alert dry run",
    body: (
      <List>
        <li>Shows what the next alert check would do right now, without sending anything.</li>
        <li>
          <strong>Would alert</strong> lists the stories that qualify. <strong>Blocked</strong> explains why nothing would be sent, for example
          outside alert hours or over the hourly limit.
        </li>
        <li>Use it to answer &ldquo;why didn&apos;t I get an alert?&rdquo;. Each person also needs alerts turned on in Notifications &amp; alerts.</li>
      </List>
    ),
  },
  password: {
    title: "Your password",
    body: (
      <List>
        <li>Use at least 12 characters. A short sentence is easy to remember and hard to guess.</li>
        <li>Changing it signs you out everywhere else, and you get a security email confirming the change.</li>
        <li>After 5 incorrect sign-in attempts, the account is locked for 15 minutes.</li>
      </List>
    ),
  },
  "forgot-password": {
    title: "Forgot your password?",
    body: (
      <List>
        <li>
          Ask a News Desk administrator. They can send you a new invitation, and its link lets you create a new password. Your stories, notes and
          follow-ups are kept.
        </li>
        <li>Locked out after too many attempts? Wait 15 minutes and try again.</li>
        <li>No administrator available? Contact the developer, listed below.</li>
      </List>
    ),
  },
  roles: {
    title: "Roles",
    body: (
      <List>
        <li>
          <strong>Member</strong>: read and review stories, manage follow-ups and notes, submit links.
        </li>
        <li>
          <strong>Manager</strong>: everything a member can, plus change priorities, resend emails and check sources on demand.
        </li>
        <li>
          <strong>Administrator</strong>: everything, including people, roles, sources and settings.
        </li>
        <li>Everyone chooses their own brief and alerts. Ask an administrator if you need a different role.</li>
      </List>
    ),
  },
} satisfies Record<string, Section>;

export type HelpTopic = keyof typeof TOPICS;

export const HELP_TOPICS: Record<HelpTopic, Section> = TOPICS;

/**
 * Page help, keyed by route. `:id` matches one path segment; exact keys beat patterns, and patterns beat prefixes.
 * Non-route keys (login, invite) are chosen explicitly by pages outside the app shell.
 */
export const HELP_CONTEXTS: Record<string, { heading: string; sections: Section[] }> = {
  login: {
    heading: "Signing in",
    sections: [
      ABOUT,
      {
        title: "How to sign in",
        body: (
          <List>
            <li>Use your work email and the password you chose when you accepted your invitation.</li>
            <li>
              Access is by invitation only. If you don&apos;t have an account, use <strong>Request access</strong>; an administrator will review it.
            </li>
            <li>After 5 incorrect attempts the account is locked for 15 minutes.</li>
          </List>
        ),
      },
      TOPICS["forgot-password"],
    ],
  },
  invite: {
    heading: "Accepting your invitation",
    sections: [
      {
        title: "Creating your account",
        body: (
          <List>
            <li>Check that the sign-in email is yours, correct your name if needed, and choose a password of at least 12 characters.</li>
            <li>
              After you choose <strong>Accept invitation and sign in</strong>, you&apos;re taken straight to News Desk. From then on, sign in with your
              work email and this password.
            </li>
            <li>
              The link works once and expires after 72 hours. If it has expired, or a newer invitation replaced it, ask the administrator who invited
              you to send another.
            </li>
          </List>
        ),
      },
      TOPICS.roles,
      ABOUT,
    ],
  },
  "/": {
    heading: "Overview",
    sections: [
      ABOUT,
      {
        title: "Reading this page",
        body: (
          <List>
            <li>
              <strong>New stories</strong>: found in the last 24 hours (a source&apos;s first sync is stored without alerts).
            </li>
            <li>
              <strong>High-priority open</strong>: P0/P1 stories not yet covered or archived.
            </li>
            <li>
              <strong>Needs review</strong>: sensitive or unverified claims. Verify before any external use.
            </li>
            <li>
              <strong>Open follow-ups</strong>: stories someone is acting on, with overdue ones flagged.
            </li>
            <li>
              <strong>Sources healthy</strong>: monitored sources whose last check succeeded.
            </li>
            <li>Each number is a link to the matching stories.</li>
          </List>
        ),
      },
      PRIORITIES,
      TOPICS["source-health"],
    ],
  },
  "/news": {
    heading: "News Feed",
    sections: [
      {
        title: "Working with stories",
        body: (
          <List>
            <li>Open a story&apos;s headline to see why it got its priority, assign a follow-up and add notes.</li>
            <li>
              <strong>Mark reviewed</strong> says you&apos;ve looked at it; <strong>Archive</strong> hides it when no action is needed.
            </li>
            <li>Summaries are the publisher&apos;s own words, never generated. Always confirm on the original page.</li>
          </List>
        ),
      },
      TOPICS["news-filters"],
      PRIORITIES,
      TOPICS.verification,
      TOPICS["submit-link"],
    ],
  },
  "/news/:id": {
    heading: "Story",
    sections: [
      {
        title: "This page",
        body: (
          <p>
            Everything about one story: the publisher&apos;s summary and a link to the original, why it got its priority, who is following it up,
            internal notes and its history. Always read the original before using a story outside News Desk.
          </p>
        ),
      },
      TOPICS.workflow,
      TOPICS["follow-up"],
      TOPICS["priority-reason"],
      TOPICS["change-priority"],
      TOPICS.verification,
    ],
  },
  "/follow-ups": {
    heading: "Follow-ups",
    sections: [
      {
        title: "Tracking follow-ups",
        body: (
          <List>
            <li>
              <strong>Open</strong> shows everything not yet covered or archived; <strong>Assigned to me</strong> shows just yours.
            </li>
            <li>To create a follow-up, open a story and use its Follow-up panel, or choose <strong>Assign</strong> on a story in the News Feed.</li>
            <li>
              Overdue items are flagged in red and listed in the assignee&apos;s news brief. Choose <strong>Mark covered</strong> when Communications
              has acted, or <strong>Archive</strong> when no action is needed.
            </li>
          </List>
        ),
      },
      TOPICS["follow-up"],
      TOPICS.workflow,
    ],
  },
  "/sources": {
    heading: "Sources",
    sections: [
      {
        title: "Source monitoring",
        body: (
          <List>
            <li>
              Sources are checked every morning before the brief, and every few minutes while anyone is signed in. New stories appear with a
              &ldquo;new stories&rdquo; banner.
            </li>
            <li>Only publisher feeds or newsroom pages that robots.txt allows are used, and no full articles are copied.</li>
            <li>
              Administrators can add a source with <strong>Add source</strong>.
            </li>
          </List>
        ),
      },
      TOPICS["source-health"],
      TOPICS["expansion-registry"],
    ],
  },
  "/sources/new": {
    heading: "Adding a source",
    sections: [TOPICS["find-feed"], TOPICS["source-fields"]],
  },
  "/sources/:id": {
    heading: "Editing a source",
    sections: [TOPICS["find-feed"], TOPICS["source-fields"], TOPICS["source-health"]],
  },
  "/settings": {
    heading: "Settings",
    sections: [
      {
        title: "What's here",
        body: (
          <p>
            How often sources are refreshed, the priority keyword rules, feature requests and the audit log. Email choices are in{" "}
            <strong>Notifications &amp; alerts</strong>; people and roles are in <strong>Team management</strong>. Only administrators can make
            changes, and every change is recorded in the audit log.
          </p>
        ),
      },
      TOPICS["email-mode"],
      TOPICS.refresh,
      TOPICS["priority-rules"],
    ],
  },
  "/team": {
    heading: "Team management",
    sections: [TOPICS.inviting, TOPICS["staff-actions"], TOPICS["access-requests"], TOPICS.roles],
  },
  "/outbox": {
    heading: "Email outbox",
    sections: [
      {
        title: "Emails",
        body: (
          <p>
            Every brief, alert, invitation and request is listed here with its delivery status. Open a message to see exactly what was sent.{" "}
            <strong>Preview my brief</strong> shows what your brief would contain right now, without sending it.
          </p>
        ),
      },
      TOPICS["email-status"],
      TOPICS["send-now"],
      TOPICS["alert-dry-run"],
    ],
  },
  "/outbox/preview": {
    heading: "Brief preview",
    sections: [
      {
        title: "Previewing your brief",
        body: (
          <p>
            This is what your next scheduled brief would contain if it were sent now. Nothing is emailed. To change its time, days or news, open{" "}
            <strong>Notifications &amp; alerts</strong>.
          </p>
        ),
      },
      TOPICS["personal-brief"],
    ],
  },
  "/outbox/:id": {
    heading: "Email message",
    sections: [
      {
        title: "This message",
        body: (
          <p>
            Exactly what News Desk produced: the email as the recipient sees it, the plain-text version, the stories it included and its delivery
            record. The dedupe key is how News Desk makes sure the same email is never sent twice.
          </p>
        ),
      },
      TOPICS["email-status"],
    ],
  },
  "/account": {
    heading: "My account",
    sections: [
      {
        title: "Your account",
        body: (
          <p>
            Your name, role and password. To choose which emails you receive, open <strong>Notifications &amp; alerts</strong>. To change your work
            email or role, ask an administrator.
          </p>
        ),
      },
      TOPICS.password,
      TOPICS.roles,
    ],
  },
  "/notifications": {
    heading: "Notifications & alerts",
    sections: [
      {
        title: "Where your emails go",
        body: (
          <p>
            Every News Desk email goes to the work email you sign in with. There is no shared mailbox: each person chooses their own brief and
            alerts here. Press <strong>Save my notifications</strong> after making changes.
          </p>
        ),
      },
      TOPICS["personal-brief"],
      TOPICS["my-alerts"],
      TOPICS["send-now"],
    ],
  },
  "/guide": {
    heading: "User guide",
    sections: [ABOUT, TOPICS["personal-brief"], PRIORITIES],
  },
};

const matches = (key: string, pathname: string) => {
  const a = key.split("/");
  const b = pathname.split("/");
  return a.length === b.length && a.every((seg, i) => seg === b[i] || (seg === ":id" && b[i] !== ""));
};

/** The page help for a route, or an explicit context such as "login". */
export function contextFor(pathname: string, override?: string) {
  if (override) return HELP_CONTEXTS[override] ?? HELP_CONTEXTS["/"];
  const routes = Object.keys(HELP_CONTEXTS).filter((k) => k.startsWith("/"));
  const key =
    routes.find((k) => k === pathname) ??
    routes.find((k) => k.includes(":") && matches(k, pathname)) ??
    routes
      .filter((k) => k !== "/" && pathname.startsWith(`${k}/`))
      .sort((a, b) => b.length - a.length)[0];
  return HELP_CONTEXTS[key ?? "/"];
}
