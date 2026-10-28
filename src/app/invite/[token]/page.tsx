import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { acceptInviteAction } from "@/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input } from "@/components/ui/primitives";
import { productionAccess } from "@/lib/auth/access";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { findInvitation } from "@/lib/auth/users";

export const metadata: Metadata = { title: "Accept invitation" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = productionAccess().enabled ? await findInvitation(token) : null;
  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-paper px-4 py-12">
      <div aria-hidden className="brand-stripe absolute inset-x-0 top-0 h-1.5" />
      <div className="w-full max-w-sm">
        <Image src="/caedm-logo.png" alt="The Catholic Archdiocese of Edmonton" width={310} height={144} priority className="mx-auto h-auto w-[200px]" />
        <h1 className="mb-6 mt-4 text-center font-serif text-2xl font-semibold text-maroon-700">Join the News Desk</h1>
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
              <p className="text-sm text-muted">
                Setting up <span className="font-medium text-ink">{invite.email}</span> as{" "}
                {invite.role === "admin" ? "Administrator" : "Communications"}.
              </p>
              <input type="hidden" name="token" value={token} />
              <Field label="Your name" htmlFor="name">
                <Input id="name" name="name" required maxLength={100} autoComplete="name" />
              </Field>
              <Field label="Password" htmlFor="password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
                <Input id="password" name="password" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
              </Field>
              <Field label="Confirm password" htmlFor="confirm">
                <Input id="confirm" name="confirm" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
              </Field>
              <SubmitButton className="w-full" pendingText="Creating account…">
                Create account
              </SubmitButton>
            </ActionForm>
          )}
        </Card>
      </div>
    </div>
  );
}
