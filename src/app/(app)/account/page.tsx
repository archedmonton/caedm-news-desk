import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { changePasswordAction } from "@/actions/auth";
import { updateAccountAction } from "@/actions/requests";
import { ActionForm, SubmitButton } from "@/components/forms";
import { HelpTrigger } from "@/components/help";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, Checkbox, Field, Input } from "@/components/ui/primitives";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { can, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { first, getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { liveEmailStatus } from "@/lib/notify/transport";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "My account" };

function Radio({ name, value, checked, label, hint }: { name: string; value: string; checked: boolean; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-paper">
      <input type="radio" name={name} value={value} defaultChecked={checked} className="mt-0.5 size-4 accent-maroon-700" />
      <span>
        <span className="text-ink">{label}</span>
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

export default async function AccountPage() {
  const session = await requireUser("manage_own_account");
  const me = (await first(getDb().select().from(users).where(eq(users.id, session.id))))!;
  const s = await getSettings();
  const mail = liveEmailStatus();
  const isAdmin = can(me.role, "manage_staff");

  return (
    <>
      <PageHeader title="My account" description="Your profile and the emails you personally receive." actions={<HelpTrigger />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActionForm action={updateAccountAction} className="space-y-6">
            <Card>
              <CardHeader title="Profile" />
              <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
                <Field label="Name" htmlFor="name">
                  <Input id="name" name="name" defaultValue={me.name} required maxLength={100} autoComplete="name" />
                </Field>
                <Field label="Work email" htmlFor="email" hint="Your sign-in. Ask an administrator to change it.">
                  <Input id="email" value={me.email} disabled readOnly />
                </Field>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Email notifications"
                description={`The team mailbox (${s.digestRecipient}) always receives the brief and alerts. These settings add your own address.`}
              />
              <div className="space-y-5 px-5 py-4">
                {!mail.live ? (
                  <p className="rounded-md border border-cobalt-100 bg-cobalt-50 px-3 py-2 text-xs text-cobalt-800">
                    Email delivery is currently simulated. Your choices are saved and will apply as soon as IT enables live email.
                  </p>
                ) : null}
                <label className="flex items-start gap-2.5 text-sm">
                  <Checkbox name="notifyDigest" defaultChecked={me.notifyDigest} className="mt-0.5" />
                  <span>
                    <span className="font-medium text-ink">Morning News Brief</span>
                    <span className="block text-xs text-muted">Daily at {s.digestTime} Edmonton time.</span>
                  </span>
                </label>
                <fieldset>
                  <legend className="mb-1 text-sm font-medium text-ink">High-priority alerts</legend>
                  <Radio
                    name="notifyAlerts"
                    value="all"
                    checked={me.notifyAlerts === "all"}
                    label="P0 Critical and P1 High"
                    hint="Sent during alert hours (P0 may be sent at any time)."
                  />
                  <Radio name="notifyAlerts" value="p0" checked={me.notifyAlerts === "p0"} label="P0 Critical only" />
                  <Radio name="notifyAlerts" value="none" checked={me.notifyAlerts === "none"} label="None (I'll check the dashboard)" />
                </fieldset>
                <label className="flex items-start gap-2.5 text-sm">
                  <Checkbox name="notifyAssignments" defaultChecked={me.notifyAssignments} className="mt-0.5" />
                  <span>
                    <span className="font-medium text-ink">Follow-ups assigned to me</span>
                    <span className="block text-xs text-muted">When a colleague assigns you a story, with its due date and note.</span>
                  </span>
                </label>
                {isAdmin ? (
                  <label className="flex items-start gap-2.5 text-sm">
                    <Checkbox name="notifyAccessRequests" defaultChecked={me.notifyAccessRequests} className="mt-0.5" />
                    <span>
                      <span className="font-medium text-ink">Access requests</span>
                      <span className="block text-xs text-muted">When someone asks to join. Requests always appear on your dashboard.</span>
                    </span>
                  </label>
                ) : null}
              </div>
            </Card>
            <SubmitButton pendingText="Saving…">Save my settings</SubmitButton>
          </ActionForm>
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
