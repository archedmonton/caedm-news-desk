import { asc, eq } from "drizzle-orm";
import { ShieldAlert, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { devLoginAction, loginAction } from "@/actions/auth";
import { requestAccessAction } from "@/actions/requests";
import { ActionForm, SubmitButton } from "@/components/forms";
import { HelpProvider, HelpTrigger } from "@/components/help";
import { Card, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { devLoginAllowed, productionAccess } from "@/lib/auth/access";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { developerContact } from "@/lib/developer";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const ROLE_ORDER = { admin: 0, manager: 1, member: 2 } as const;

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const access = productionAccess();
  const dev = devLoginAllowed();
  const domain = env().ALLOWED_EMAIL_DOMAIN;
  const devUsers = dev
    ? (await getDb().select().from(users).where(eq(users.status, "active")).orderBy(asc(users.email))).sort(
        (a, b) => Number(b.isDeveloper) - Number(a.isDeveloper) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role],
      )
    : [];

  return (
    <HelpProvider developer={developerContact()} signedIn={false} context="login">
      <div className="relative min-h-dvh bg-paper px-4 py-8">
        <div aria-hidden className="brand-stripe absolute inset-x-0 top-0 h-1.5" />
        <div className="mx-auto flex max-w-sm justify-end">
          <HelpTrigger variant="ghost" />
        </div>
        <div className="mx-auto mt-2 w-full max-w-sm">
          <div className="mb-6 text-center">
            <Image
              src="/caedm-logo.png"
              alt="The Catholic Archdiocese of Edmonton"
              width={310}
              height={144}
              priority
              className="mx-auto h-auto w-[220px]"
            />
            <h1 className="mx-auto mt-5 w-fit border-t-2 border-gold-500 px-6 pt-3 font-serif text-2xl font-semibold text-maroon-700">News Desk</h1>
            <p className="mt-1 text-sm text-muted">Communications monitoring · staff access only</p>
          </div>
          <Card className="p-6">
            {!access.enabled ? (
              <div role="alert" className="flex gap-3 text-sm">
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-p1" />
                <div>
                  <p className="font-medium text-ink">Sign-in is not yet available</p>
                  <p className="mt-1 text-muted">
                    Production access stays disabled until IT configures approved email delivery for verified invitations. {access.reason}
                  </p>
                </div>
              </div>
            ) : (
              <ActionForm action={loginAction} className="space-y-4">
                <Field label="Work email" htmlFor="email">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    placeholder={`name@${domain}`}
                    pattern={`[^@\\s]+@${domain.replace(/\./g, "\\.")}`}
                    title={`Use your @${domain} work email`}
                  />
                </Field>
                <Field label="Password" htmlFor="password">
                  <Input id="password" name="password" type="password" autoComplete="current-password" required />
                </Field>
                <SubmitButton className="w-full" pendingText="Signing in…">
                  Sign in
                </SubmitButton>
              </ActionForm>
            )}
          </Card>

          <Card className="mt-4 p-0">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-6 py-4 text-sm font-medium text-ink">
                <UserPlus className="size-4 text-maroon-700" /> Don&apos;t have an account? Request access
              </summary>
              <div className="border-t border-line px-6 py-5">
                <p className="mb-4 text-xs text-muted">
                  Your details go to the News Desk administrators. If approved, you&apos;ll receive an invitation at your work email.
                </p>
                <ActionForm action={requestAccessAction} resetOnSuccess className="space-y-3">
                  {/* Honeypot for bots; hidden from people and assistive technology. */}
                  <div aria-hidden className="absolute -left-[9999px]">
                    <label>
                      Website <input name="website" tabIndex={-1} autoComplete="off" />
                    </label>
                  </div>
                  <Field label="Full name" htmlFor="ra-name">
                    <Input id="ra-name" name="name" required maxLength={100} autoComplete="name" />
                  </Field>
                  <Field label="Work email" htmlFor="ra-email">
                    <Input id="ra-email" name="email" type="email" required placeholder={`name@${domain}`} autoComplete="email" />
                  </Field>
                  <Field label="Department or position" htmlFor="ra-dept">
                    <Input id="ra-dept" name="department" maxLength={120} placeholder="e.g. Communications, Catholic Education office" />
                  </Field>
                  <Field label="Access needed" htmlFor="ra-role">
                    <Select id="ra-role" name="requestedRole" defaultValue="member">
                      {(["member", "manager"] as const).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Why do you need access? (optional)" htmlFor="ra-reason">
                    <Textarea id="ra-reason" name="reason" maxLength={1000} rows={3} />
                  </Field>
                  <SubmitButton variant="outline" className="w-full" pendingText="Sending…">
                    Send request
                  </SubmitButton>
                </ActionForm>
              </div>
            </details>
          </Card>

          {dev ? (
            <Card className="mt-4 border-dashed p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-p1">Development sign-in</p>
              <p className="mt-1 text-xs text-muted">Local development only. This panel cannot appear in a production build.</p>
              <div className="mt-3 space-y-2">
                {devUsers.length === 0 ? (
                  <p className="text-sm text-muted">
                    No active users. Run <code>npm run db:setup</code>.
                  </p>
                ) : null}
                {devUsers.map((u) => (
                  <form key={u.id} action={devLoginAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <SubmitButton variant="outline" size="sm" className="w-full justify-between">
                      <span>{u.name || u.email}</span>
                      <span className="text-xs text-muted">{u.isDeveloper ? "Developer · Administrator" : ROLE_LABELS[u.role]}</span>
                    </SubmitButton>
                  </form>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </HelpProvider>
  );
}
