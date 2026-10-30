import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { acceptInviteAction } from "@/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input } from "@/components/ui/primitives";
import { productionAccess } from "@/lib/auth/access";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/permissions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { findInvitation } from "@/lib/auth/users";
import { first, getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Accept invitation" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = productionAccess().enabled ? await findInvitation(token) : null;
  const invitee = invite ? await first(getDb().select({ name: users.name }).from(users).where(eq(users.email, invite.email))) : null;
  const firstName = invitee?.name.trim().split(/\s+/)[0];
  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-paper px-4 py-12">
      <div aria-hidden className="brand-stripe absolute inset-x-0 top-0 h-1.5" />
      <div className="w-full max-w-sm">
        <Image src="/caedm-logo.png" alt="The Catholic Archdiocese of Edmonton" width={310} height={144} priority className="mx-auto h-auto w-[200px]" />
        <h1 className="mt-4 text-center font-serif text-2xl font-semibold text-maroon-700">{firstName ? `Welcome, ${firstName}` : "Join the News Desk"}</h1>
        {invite ? <p className="mb-6 mt-1 text-center text-sm text-muted">Accept your invitation and create your password.</p> : <div className="mb-6" />}
        <Card className="p-6">
          {!invite ? (
            <div className="space-y-3 text-sm">
              <p className="font-medium text-ink">This invitation link is invalid, expired or already used.</p>
              <p className="text-muted">Ask a News Desk administrator to send a new invitation.</p>
              <Link href="/login" className="text-cobalt-700 underline">
                Go to sign-in
              </Link>
            </div>
          ) : (
            <ActionForm action={acceptInviteAction} className="space-y-4">
              <div className="rounded-md border border-line bg-paper px-3 py-2.5 text-sm">
                <div className="text-muted">
                  Signing in as <span className="font-medium text-ink">{invite.email}</span>
                </div>
                <div className="mt-1 text-muted">
                  Role: <span className="font-medium text-ink">{ROLE_LABELS[invite.role]}</span>. {ROLE_DESCRIPTIONS[invite.role]}
                </div>
              </div>
              <input type="hidden" name="token" value={token} />
              <Field label="Your name" htmlFor="name">
                <Input id="name" name="name" required maxLength={100} autoComplete="name" defaultValue={invitee?.name ?? ""} />
              </Field>
              <Field label="Create a password" htmlFor="password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
                <Input id="password" name="password" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
              </Field>
              <Field label="Confirm password" htmlFor="confirm">
                <Input id="confirm" name="confirm" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
              </Field>
              <SubmitButton className="w-full" pendingText="Creating account…">
                Accept invitation and sign in
              </SubmitButton>
            </ActionForm>
          )}
        </Card>
      </div>
    </div>
  );
}
