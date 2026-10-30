import { eq } from "drizzle-orm";
import { Bell } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { changePasswordAction } from "@/actions/auth";
import { updateProfileAction } from "@/actions/requests";
import { ActionForm, SubmitButton } from "@/components/forms";
import { HelpTrigger } from "@/components/help";
import { PageHeader } from "@/components/page-header";
import { Button, Card, CardHeader, Field, Input } from "@/components/ui/primitives";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { first, getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { briefScheduleLabel } from "@/lib/notify/brief-schedule";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "My account" };

const ALERT_LABEL = { all: "P0 and P1", p0: "P0 Critical only", none: "off" } as const;

export default async function AccountPage() {
  const session = await requireUser("manage_own_account");
  const me = (await first(getDb().select().from(users).where(eq(users.id, session.id))))!;
  const s = await getSettings();

  return (
    <>
      <PageHeader title="My account" description="Your profile, role and password." actions={<HelpTrigger />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ActionForm action={updateProfileAction}>
            <Card>
              <CardHeader title="Profile" />
              <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
                <Field label="Name" htmlFor="name">
                  <Input id="name" name="name" defaultValue={me.name} required maxLength={100} autoComplete="name" />
                </Field>
                <Field label="Work email" htmlFor="email" hint="Your sign-in, and where your emails are sent. Ask an administrator to change it.">
                  <Input id="email" value={me.email} disabled readOnly />
                </Field>
                <div className="sm:col-span-2">
                  <SubmitButton size="sm" pendingText="Saving…">
                    Save profile
                  </SubmitButton>
                </div>
              </div>
            </Card>
          </ActionForm>

          <Card>
            <CardHeader title="Emails you receive" />
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
              <p className="text-muted">
                News brief: <span className="text-ink">{me.notifyDigest ? briefScheduleLabel(me, s.digestTime) : "off"}</span> · Alerts:{" "}
                <span className="text-ink">{ALERT_LABEL[me.notifyAlerts]}</span>
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/notifications">
                  <Bell /> Notifications &amp; alerts
                </Link>
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-6 self-start">
          <Card>
            <CardHeader title="Access" />
          <dl className="space-y-3 px-5 py-4 text-sm">
            <div>
              <dt className="text-xs text-subtle">Role</dt>
              <dd className="font-medium text-ink">
                {ROLE_LABELS[me.role]}
                {me.isDeveloper ? " · Developer" : ""}
              </dd>
              <dd className="text-xs text-muted">{ROLE_DESCRIPTIONS[me.role]}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Last sign-in</dt>
              <dd>{formatDateTime(me.lastLoginAt)}</dd>
            </div>
            <p className="text-xs text-muted">Only administrators can add people or change roles.</p>
          </dl>
          </Card>

          <Card id="password">
            <CardHeader title="Password" description="Changing it signs you out on your other devices." />
            {me.passwordHash ? (
              <ActionForm action={changePasswordAction} resetOnSuccess className="space-y-4 px-5 py-4">
                {/* Lets password managers attach the new password to the right account. */}
                <input type="email" name="username" value={me.email} autoComplete="username" readOnly hidden />
                <Field label="Current password" htmlFor="currentPassword">
                  <Input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" maxLength={200} />
                </Field>
                <Field label="New password" htmlFor="newPassword" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
                  <Input id="newPassword" name="newPassword" type="password" required minLength={MIN_PASSWORD_LENGTH} maxLength={200} autoComplete="new-password" />
                </Field>
                <Field label="Confirm new password" htmlFor="confirmPassword">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    maxLength={200}
                    autoComplete="new-password"
                  />
                </Field>
                <SubmitButton variant="outline" className="w-full" pendingText="Changing…">
                  Change password
                </SubmitButton>
              </ActionForm>
            ) : (
              <p className="px-5 py-4 text-sm text-muted">This account has no password. Development accounts sign in with the development shortcut.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
