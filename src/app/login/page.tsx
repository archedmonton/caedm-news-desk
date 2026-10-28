import { asc, eq } from "drizzle-orm";
import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { devLoginAction, loginAction } from "@/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input } from "@/components/ui/primitives";
import { devLoginAllowed, productionAccess } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const access = productionAccess();
  const dev = devLoginAllowed();
  const devUsers = dev ? getDb().select().from(users).where(eq(users.status, "active")).orderBy(asc(users.role), asc(users.email)).all() : [];

  return (
    <div className="flex min-h-dvh items-center justify-center bg-navy-900 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold-500">Catholic Archdiocese of Edmonton</div>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-white">CAEDM News Desk</h1>
          <p className="mt-1 text-sm text-navy-100/70">Communications monitoring · staff access only</p>
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
                <Input id="email" name="email" type="email" autoComplete="username" required placeholder="name@caedm.ca" />
              </Field>
              <Field label="Password" htmlFor="password">
                <Input id="password" name="password" type="password" autoComplete="current-password" required />
              </Field>
              <SubmitButton className="w-full" pendingText="Signing in…">
                Sign in
              </SubmitButton>
              <p className="text-xs text-muted">Access is by administrator invitation only.</p>
            </ActionForm>
          )}
        </Card>
        {dev ? (
          <Card className="mt-4 border-dashed p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-p1">Development sign-in</p>
            <p className="mt-1 text-xs text-muted">Local development only. This panel cannot appear in a production build.</p>
            <div className="mt-3 space-y-2">
              {devUsers.length === 0 ? <p className="text-sm text-muted">No active users. Run <code>npm run db:setup</code>.</p> : null}
              {devUsers.map((u) => (
                <form key={u.id} action={devLoginAction}>
                  <input type="hidden" name="userId" value={u.id} />
                  <SubmitButton variant="outline" size="sm" className="w-full justify-between">
                    <span>{u.name || u.email}</span>
                    <span className="text-xs text-muted">{u.role === "admin" ? "Administrator" : "Communications"}</span>
                  </SubmitButton>
                </form>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
