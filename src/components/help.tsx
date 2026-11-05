"use client";

import { BookOpen, CircleHelp, Lightbulb, Mail, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { submitFeatureRequestAction } from "@/actions/requests";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { contextFor, HELP_TOPICS, type HelpTopic } from "@/components/help-content";
import { cn } from "@/lib/utils";

export type { HelpTopic };

type HelpView = "help" | "feature";
const HelpContext = React.createContext<{ open: (v: HelpView, topic?: HelpTopic) => void; signedIn: boolean } | null>(null);

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
  const [topic, setTopic] = React.useState<HelpTopic | null>(null);
  const ctx = contextFor(pathname, context);
  const focused = topic ? HELP_TOPICS[topic] : null;
  // The topic a help icon asked about comes first; the page's other help follows it.
  const sections = focused ? [focused, ...ctx.sections.filter((s) => s.title !== focused.title)] : ctx.sections;
  const value = React.useMemo(
    () => ({
      signedIn,
      open: (v: HelpView, t?: HelpTopic) => {
        setView(v);
        setTopic(t ?? null);
        ref.current?.showModal();
        ref.current?.scrollTo({ top: 0 });
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
        className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-md overflow-y-auto bg-surface p-0 text-ink shadow-2xl backdrop:bg-maroon-900/40"
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
            {sections.map((s) => (
              <section
                key={s.title}
                className={cn(s === focused && "rounded-lg border border-gold-300 bg-gold-100/40 p-4")}
                aria-current={s === focused ? "true" : undefined}
              >
                <h3 className="mb-1.5 font-semibold">{s.title}</h3>
                <div className="text-muted [&_strong]:text-ink">{s.body}</div>
              </section>
            ))}
            {signedIn ? (
              <Link
                href="/guide"
                onClick={() => ref.current?.close()}
                className="flex items-center gap-2 rounded-lg border border-line px-4 py-3 font-medium text-cobalt-700 hover:bg-paper"
              >
                <BookOpen className="size-4" aria-hidden /> Read the full user guide
              </Link>
            ) : null}
            <section className="rounded-lg border border-line bg-paper p-4" aria-labelledby="support-title">
              <h3 id="support-title" className="font-semibold">
                Help &amp; support
              </h3>
              <p className="mt-1 text-muted">For questions, access problems or ideas, contact the developer:</p>
              <p className="mt-2 font-medium">{developer.name}</p>
              <a
                href={`mailto:${developer.email}?subject=${encodeURIComponent("CAEDM News Desk support")}`}
                className="inline-flex items-center gap-1.5 text-cobalt-700 hover:underline"
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
        className={cn("flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted hover:bg-maroon-50 hover:text-maroon-800", className)}
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

/** Small "?" beside a feature: opens Help with that feature's explanation first. With children, renders as a text link instead. */
export function HelpHint({ topic, label, className, children }: { topic: HelpTopic; label: string; className?: string; children?: React.ReactNode }) {
  const help = React.useContext(HelpContext);
  if (!help) return null;
  if (children) {
    return (
      <button
        type="button"
        onClick={() => help.open("help", topic)}
        aria-haspopup="dialog"
        className={cn("inline-flex items-center gap-1 text-sm text-cobalt-700 hover:underline", className)}
      >
        <CircleHelp className="size-3.5" aria-hidden /> {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => help.open("help", topic)}
      aria-haspopup="dialog"
      aria-label={`Help: ${label}`}
      title={`Help: ${label}`}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full align-middle text-subtle hover:bg-cobalt-50 hover:text-cobalt-700 focus-visible:text-cobalt-700",
        className,
      )}
    >
      <CircleHelp className="size-4" aria-hidden />
    </button>
  );
}
