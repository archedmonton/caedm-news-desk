import { CircleAlert, Clock, MailCheck, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { acceptInviteAction } from "@/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { productionAccess } from "@/lib/auth/access";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/permissions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { inspectInvitation } from "@/lib/auth/users";
import { developerContact } from "@/lib/developer";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Accept invitation", referrer: "no-referrer" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function Shell({ heading, intro, children }: { heading: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-paper px-4 py-12">
      <div aria-hidden className="brand-stripe absolute inset-x-0 top-0 h-1.5" />
      <main className="w-full max-w-md">
        <Image src="/caedm-logo.png" alt="The Catholic Archdiocese of Edmonton" width={310} height={144} priority className="mx-auto h-auto w-[190px]" />
        <p className="mt-3 text-center text-xs font-semibold uppercase tracking-wider text-muted">News Desk</p>
        <h1 className="mt-2 text-center font-serif text-2xl font-semibold text-maroon-700">{heading}</h1>
        {intro ? <p className="mt-1 text-center text-sm text-muted">{intro}</p> : null}
        <Card className="mt-6 p-6">{children}</Card>
      </main>
    </div>
  );
}

/** Explains why a link can't be used and what to do next. */
function Problem({ icon, title, children, signIn }: { icon: React.ReactNode; title: string; children: React.ReactNode; signIn?: boolean }) {
  const dev = developerContact();
  return (
    <div className="space-y-4 text-sm" data-testid="invite-problem">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-maroon-700">{icon}</span>
        <div>
          <h2 className="font-semibold text-ink">{title}</h2>
          <div className="mt-1 text-muted">{children}</div>
        </div>
      </div>
      {signIn ? (
        <Button asChild className="w-full">
          <Link href="/login">Go to sign-in</Link>
        </Button>
      ) : (
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Go to the sign-in page</Link>
        </Button>
      )}
      <p className="text-xs text-muted">
        Need help? Contact {dev.name} at{" "}
        <a href={`mailto:${dev.email}`} className="text-cobalt-700 underline">
          {dev.email}
        </a>
        .
      </p>
    </div>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!productionAccess().enabled) {
    return (
      <Shell heading="Join the News Desk">
        <Problem icon={<CircleAlert className="size-5" />} title="Account setup isn't available yet">
          Sign-up opens once email delivery has been verified. Please try your link again later.
        </Problem>
      </Shell>
    );
  }
  const r = await inspectInvitation(token);

  if (r.state === "invalid") {
    return (
      <Shell heading="Join the News Desk">
        <Problem icon={<CircleAlert className="size-5" />} title="This invitation link isn't valid">
          It may have been copied incompletely. Open the link straight from your invitation email, or ask a News Desk administrator for a new
          invitation.
        </Problem>
      </Shell>
    );
  }
  const inv = r.invitation;
  if (r.state === "used" || (r.state !== "valid" && r.accountActive)) {
    return (
      <Shell heading="You're already set up">
        <Problem icon={<ShieldCheck className="size-5" />} title="This invitation has already been accepted" signIn>
          Sign in with <strong className="text-ink">{inv.email}</strong> and the password you created. Forgotten it? Ask an administrator to
          send a new invitation.
        </Problem>
      </Shell>
    );
  }
  if (r.state === "expired") {
    return (
      <Shell heading="This invitation has expired">
        <Problem icon={<Clock className="size-5" />} title={`It expired ${formatDateTime(inv.expiresAt)}`}>
          For security, invitation links work for 72 hours. Ask a News Desk administrator to send a new invitation to{" "}
          <strong className="text-ink">{inv.email}</strong>.
        </Problem>
      </Shell>
    );
  }
  if (r.state === "replaced") {
    return (
      <Shell heading="A newer invitation was sent">
        <Problem icon={<MailCheck className="size-5" />} title="Please use the most recent invitation email">
          An administrator sent a new invitation to <strong className="text-ink">{inv.email}</strong>, which replaced this one. Open the link in
          the latest email.
        </Problem>
      </Shell>
    );
  }

  const firstName = r.name.trim().split(/\s+/)[0];
  return (
    <Shell heading={firstName ? `Welcome, ${firstName}` : "Join the News Desk"} intro="Accept your invitation by creating your password.">
      <ActionForm action={acceptInviteAction} className="space-y-4">
        <dl className="space-y-1.5 rounded-md border border-line bg-paper px-3 py-2.5 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted">Sign-in email</dt>
            <dd className="font-medium text-ink">{inv.email}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted">Role</dt>
            <dd className="text-ink">
              <span className="font-medium">{ROLE_LABELS[inv.role]}</span>
              <span className="text-muted">. {ROLE_DESCRIPTIONS[inv.role]}</span>
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted">Link expires</dt>
            <dd className="text-ink">{formatDateTime(inv.expiresAt)}</dd>
          </div>
        </dl>
        <input type="hidden" name="token" value={token} />
        <Field label="Your name" htmlFor="name">
          <Input id="name" name="name" required maxLength={100} autoComplete="name" defaultValue={r.name} />
        </Field>
        <Field label="Create a password" htmlFor="password" hint={`At least ${MIN_PASSWORD_LENGTH} characters. A short sentence is easy to remember.`}>
          <Input id="password" name="password" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
        </Field>
        <SubmitButton className="w-full" pendingText="Setting up your account…">
          Accept invitation and sign in
        </SubmitButton>
      </ActionForm>
    </Shell>
  );
}
