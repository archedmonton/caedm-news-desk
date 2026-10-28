"use client";

import { CircleHelp, Lightbulb, Mail, X } from "lucide-react";
import { usePathname } from "next/navigation";
import * as React from "react";
import { submitFeatureRequestAction } from "@/actions/requests";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type Section = { title: string; body: React.ReactNode };

const ABOUT: Section = {
  title: "About CAEDM News Desk",
  body: (
    <p>
      News Desk watches approved Catholic and Edmonton news sources for the Archdiocese&apos;s Communications team. It ranks stories by importance,
      emails a morning brief around 8:00 AM (Edmonton time), keeps the dashboard up to date while you are signed in, and tracks follow-ups so nothing
      is missed.
    </p>
  ),
};

const PRIORITIES: Section = {
  title: "What the priorities mean",
  body: (
    <ul className="list-disc space-y-1 pl-5">
      <li>
        <strong>P0 Critical</strong>: serious, time-sensitive developments directly involving the Archdiocese or a local Catholic institution. Alerts
        are sent immediately.
      </li>
      <li>
        <strong>P1 High</strong>: important local Catholic, education, healthcare or policy news that needs timely review. Alerts are sent during
        alert hours.
      </li>
      <li>
        <strong>P2 Standard</strong>: relevant community news, events and routine announcements, included in the morning brief.
      </li>
      <li>
        <strong>P3 Background</strong>: context, including routine international news.
      </li>
    </ul>
  ),
};

const CONTEXT: Record<string, { heading: string; sections: Section[] }> = {
  login: {
    heading: "Signing in",
    sections: [
      ABOUT,
      {
        title: "How to sign in",
        body: (
          <ul className="list-disc space-y-1 pl-5">
            <li>Use your @caedm.ca work email and the password you chose when you accepted your invitation.</li>
            <li>
              Access is by invitation only. If you don&apos;t have an account, use <strong>Request access</strong>; an administrator will review it.
            </li>
            <li>After 5 incorrect attempts the account is locked for 15 minutes.</li>
          </ul>
        ),
      },
    ],
  },
  "/": {
    heading: "Overview",
    sections: [
      ABOUT,
      {
        title: "Reading this page",
        body: (
          <ul className="list-disc space-y-1 pl-5">
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
              <strong>Sources healthy</strong>: monitored sources whose last check succeeded.
            </li>
          </ul>
        ),
      },
      PRIORITIES,
    ],
  },
  "/news": {
    heading: "News Feed",
    sections: [
      {
        title: "Working with stories",
        body: (
          <ul className="list-disc space-y-1 pl-5">
            <li>Search and filter by source, priority, status and date. Dates use Edmonton time.</li>
            <li>Workflow: New → Reviewing → Assigned → Covered or Archived.</li>
            <li>
              Open a story to see <em>why</em> it got its priority, change the priority (managers), assign a follow-up and add notes.
            </li>
            <li>Summaries are the publisher&apos;s own words, never generated. Always confirm on the original page.</li>
            <li>
              Use <strong>Submit a link</strong> for news from sources that aren&apos;t monitored; these are marked unverified.
            </li>
          </ul>
        ),
      },
      PRIORITIES,
    ],
  },
  "/follow-ups": {
    heading: "Follow-ups",
    sections: [
      {
        title: "Tracking follow-ups",
        body: (
          <ul className="list-disc space-y-1 pl-5">
            <li>Assign stories from the story page; assignees get an email if they have that turned on in My account.</li>
            <li>Overdue items are flagged and listed in the morning brief.</li>
            <li>Mark covered when Communications has acted; archive when no action is needed.</li>
          </ul>
        ),
      },
    ],
  },
  "/sources": {
    heading: "Sources",
    sections: [
      {
        title: "Source monitoring",
        body: (
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Sources are checked every morning before the brief, and every few minutes while anyone is signed in. New stories appear with a
              &ldquo;new stories&rdquo; banner. A failing source backs off automatically and the others keep working.
            </li>
            <li>Only publisher feeds or newsroom pages that robots.txt allows are used, and no full articles are copied.</li>
            <li>
              Administrators can add a source with <strong>Add source</strong>: enter the website, use <em>Find feed</em>, then <em>Test</em>. Only
              sources with a working RSS/Atom feed can be monitored; ask the developer about organizations without one.
            </li>
          </ul>
        ),
      },
    ],
  },
  "/settings": {
    heading: "Settings",
    sections: [
      {
        title: "Roles",
        body: (
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Administrator</strong>: everything, including staff, sources and settings. Only administrators can add people.
            </li>
            <li>
              <strong>Manager</strong>: member rights plus priority changes, brief/alert tools and source checks.
            </li>
            <li>
              <strong>Member</strong>: review stories, follow-ups, notes, submit links.
            </li>
            <li>
              <strong>Viewer</strong>: read-only.
            </li>
          </ul>
        ),
      },
    ],
  },
  "/outbox": {
    heading: "Email outbox",
    sections: [
      {
        title: "Emails",
        body: (
          <p>
            Every brief, alert, invitation and request is listed with its delivery status. Until IT enables live email, messages are stored as
            <em> simulated</em> and nothing leaves the system.
          </p>
        ),
      },
    ],
  },
  "/account": {
    heading: "My account",
    sections: [
      {
        title: "Your email notifications",
        body: (
          <p>
            The team mailbox always receives the brief and alerts. Here you choose what <em>you</em> also receive at your own address: the morning
            brief, high-priority alerts (all or P0 only), follow-up assignments and, for administrators, access requests.
          </p>
        ),
      },
    ],
  },
};

function contextFor(pathname: string, override?: string) {
  if (override) return CONTEXT[override] ?? CONTEXT["/"];
  const key = Object.keys(CONTEXT)
    .filter((k) => k.startsWith("/"))
    .sort((a, b) => b.length - a.length)
    .find((k) => (k === "/" ? pathname === "/" : pathname === k || pathname.startsWith(`${k}/`)));
  return CONTEXT[key ?? "/"];
}

type HelpView = "help" | "feature";
const HelpContext = React.createContext<{ open: (v: HelpView) => void; signedIn: boolean } | null>(null);

/** Owns the single help dialog for a page tree; triggers anywhere inside open it. */
export function HelpProvider({
  developer,
  signedIn,
  context,
  children,
}: {
  developer: { name: string; email: string };
  signedIn: boolean;
  context?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const ref = React.useRef<HTMLDialogElement>(null);
  const [view, setView] = React.useState<HelpView>("help");
  const ctx = contextFor(pathname, context);
  const value = React.useMemo(
    () => ({
      signedIn,
      open: (v: HelpView) => {
        setView(v);
        ref.current?.showModal();
      },
    }),
    [signedIn],
  );

  return (
    <HelpContext.Provider value={value}>
      {children}
      <dialog
        ref={ref}
        aria-labelledby="help-title"
        className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-md overflow-y-auto bg-surface p-0 text-ink shadow-2xl backdrop:bg-navy-900/40"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
          <h2 id="help-title" className="font-serif text-lg font-semibold">
            {view === "help" ? `Help: ${ctx.heading}` : "Request a feature"}
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="rounded-md p-1.5 text-muted hover:bg-paper hover:text-ink"
            aria-label="Close help"
          >
            <X className="size-5" />
          </button>
        </div>

        {view === "help" ? (
          <div className="space-y-6 px-5 py-5 text-sm leading-relaxed text-ink">
            {ctx.sections.map((s) => (
              <section key={s.title}>
                <h3 className="mb-1.5 font-semibold">{s.title}</h3>
                <div className="text-muted [&_strong]:text-ink">{s.body}</div>
              </section>
            ))}
            <section className="rounded-lg border border-line bg-paper p-4" aria-labelledby="support-title">
              <h3 id="support-title" className="font-semibold">
                Help &amp; support
              </h3>
              <p className="mt-1 text-muted">For questions, access problems or ideas, contact the developer:</p>
              <p className="mt-2 font-medium">{developer.name}</p>
              <a
                href={`mailto:${developer.email}?subject=${encodeURIComponent("CAEDM News Desk support")}`}
                className="inline-flex items-center gap-1.5 text-navy-700 hover:underline"
              >
                <Mail className="size-4" /> {developer.email}
              </a>
              <div className="mt-3">
                {signedIn ? (
                  <Button type="button" size="sm" onClick={() => setView("feature")}>
                    <Lightbulb /> Request a feature
                  </Button>
                ) : (
                  <p className="text-xs text-muted">Signed-in staff can also send feature requests from inside News Desk.</p>
                )}
              </div>
            </section>
          </div>
        ) : (
          <div className="px-5 py-5">
            <p className="mb-4 text-sm text-muted">
              Your request is emailed to <strong className="text-ink">{developer.name}</strong> ({developer.email}) and saved for follow-up.
            </p>
            <ActionForm action={submitFeatureRequestAction} resetOnSuccess className="space-y-4">
              <input type="hidden" name="page" value={pathname} />
              <Field label="Title" htmlFor="fr-title">
                <Input id="fr-title" name="title" required maxLength={150} placeholder="e.g. Add CBC Edmonton as a source" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type" htmlFor="fr-category">
                  <Select id="fr-category" name="category" defaultValue="feature">
                    <option value="feature">New feature</option>
                    <option value="improvement">Improvement</option>
                    <option value="source">New news source</option>
                    <option value="bug">Problem / bug</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="Importance" htmlFor="fr-importance">
                  <Select id="fr-importance" name="importance" defaultValue="important">
                    <option value="nice_to_have">Nice to have</option>
                    <option value="important">Important</option>
                    <option value="urgent">Urgent</option>
                  </Select>
                </Field>
              </div>
              <Field label="Details" htmlFor="fr-description" hint="What would you like, and how would it help Communications?">
                <Textarea id="fr-description" name="description" required minLength={10} maxLength={4000} rows={6} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <SubmitButton pendingText="Sending…">Send request</SubmitButton>
                <Button type="button" variant="ghost" onClick={() => setView("help")}>
                  Back to help
                </Button>
              </div>
            </ActionForm>
          </div>
        )}
      </dialog>
    </HelpContext.Provider>
  );
}

export function HelpTrigger({
  view = "help",
  variant = "outline",
  className,
  label,
}: {
  view?: HelpView;
  variant?: "outline" | "ghost" | "sidebar";
  className?: string;
  label?: string;
}) {
  const help = React.useContext(HelpContext);
  if (!help || (view === "feature" && !help.signedIn)) return null;
  const Icon = view === "help" ? CircleHelp : Lightbulb;
  const text = label ?? (view === "help" ? "Help" : "Request a feature");
  if (variant === "sidebar") {
    return (
      <button
        type="button"
        onClick={() => help.open(view)}
        aria-haspopup="dialog"
        className={cn("flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-navy-100/80 hover:bg-white/5 hover:text-white", className)}
      >
        <Icon className="size-4" aria-hidden /> <span className="flex-1 text-left">{text}</span>
      </button>
    );
  }
  return (
    <Button type="button" variant={variant} size="sm" onClick={() => help.open(view)} className={className} aria-haspopup="dialog">
      <Icon /> {text}
    </Button>
  );
}
