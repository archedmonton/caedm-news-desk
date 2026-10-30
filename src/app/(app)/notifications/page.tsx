import { eq } from "drizzle-orm";
import { Mail, Send } from "lucide-react";
import type { Metadata } from "next";
import { saveSettingsAction } from "@/actions/admin";
import { sendBriefNowAction } from "@/actions/notifications";
import { updateNotificationsAction } from "@/actions/requests";
import { ActionForm, SubmitButton } from "@/components/forms";
import { HelpHint, HelpTrigger } from "@/components/help";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, Checkbox, Field, Input, Select } from "@/components/ui/primitives";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { first, getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { BRIEF_TIMES, briefScheduleLabel, formatClock } from "@/lib/notify/brief-schedule";
import { liveEmailStatus } from "@/lib/notify/transport";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Notifications & alerts" };

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

export default async function NotificationsPage() {
  const session = await requireUser("manage_own_account");
  const me = (await first(getDb().select().from(users).where(eq(users.id, session.id))))!;
  const s = await getSettings();
  const mail = liveEmailStatus();
  const isAdmin = can(me.role, "manage_staff");
  const canEditRules = can(me.role, "manage_settings");
  const hours = `${formatClock(s.alertWindowStart)} to ${formatClock(s.alertWindowEnd)}`;

  return (
    <>
      <PageHeader
        title="Notifications & alerts"
        description="Choose which News Desk emails you receive. Everything is sent to your own work email."
        actions={<HelpTrigger />}
      />

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-maroon-50 text-maroon-700">
              <Mail className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="text-xs text-subtle">Recipient</div>
              <div className="truncate font-semibold text-ink" data-testid="my-recipient">
                {me.email}
              </div>
              <div className="text-xs text-muted">Your sign-in email (you). Briefs and alerts are sent here and nowhere else.</div>
            </div>
          </div>
          <ActionForm action={sendBriefNowAction} className="sm:text-right">
            <span className="inline-flex items-center gap-1">
              <SubmitButton variant="outline" pendingText="Sending…">
                <Send /> Send me a brief now
              </SubmitButton>
              <HelpHint topic="send-now" label="Send me a brief now" />
            </span>
          </ActionForm>
        </div>
        {!mail.live ? (
          <p className="border-t border-line bg-cobalt-50 px-5 py-2.5 text-xs text-cobalt-800">
            Email delivery is currently simulated. Your choices are saved and apply as soon as IT enables live email; until then, messages appear
            in the Email outbox.
          </p>
        ) : null}
      </Card>

      <ActionForm action={updateNotificationsAction} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card id="brief" className="scroll-mt-6">
            <CardHeader title="My news brief" description="A summary of new stories at the time you choose (Edmonton time)." />
            <div className="space-y-4 px-5 py-4">
              {!s.digestEnabled ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  News briefs are currently turned off for everyone by an administrator.
                </p>
              ) : null}
              <div className="flex items-start gap-2.5 text-sm">
                <Checkbox id="notifyDigest" name="notifyDigest" defaultChecked={me.notifyDigest} className="mt-0.5" />
                <label htmlFor="notifyDigest" className="flex-1">
                  <span className="font-medium text-ink">Email me a news brief</span>
                  <span className="block text-xs text-muted">Currently: {me.notifyDigest ? briefScheduleLabel(me, s.digestTime) : "off"}.</span>
                </label>
                <HelpHint topic="personal-brief" label="My news brief" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Time (Edmonton)" htmlFor="digestTime">
                  <Select id="digestTime" name="digestTime" defaultValue={me.digestTime ?? "default"}>
                    <option value="default">Default ({formatClock(s.digestTime)})</option>
                    {BRIEF_TIMES.map((t) => (
                      <option key={t} value={t}>
                        {formatClock(t)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Days" htmlFor="digestDays">
                  <Select id="digestDays" name="digestDays" defaultValue={me.digestDays}>
                    <option value="daily">Every day</option>
                    <option value="weekdays">Weekdays only (Mon–Fri)</option>
                  </Select>
                </Field>
              </div>
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-ink">Include</legend>
                <Radio
                  name="digestScope"
                  value="catholic"
                  checked={me.digestScope === "catholic"}
                  label="Catholic news only"
                  hint="The Archdiocese, Catholic partners, Canadian Catholic and Vatican sources."
                />
                <Radio name="digestScope" value="all" checked={me.digestScope === "all"} label="All monitored news" hint="Adds government and other sources." />
              </fieldset>
            </div>
          </Card>

          <div className="space-y-6">
            <Card id="alerts" className="scroll-mt-6">
              <CardHeader
                title={
                  <span className="flex items-center gap-1">
                    My high-priority alerts <HelpHint topic="my-alerts" label="My high-priority alerts" />
                  </span>
                }
                description={`Separate emails for urgent stories, sent ${hours}${s.alertP0BypassWindow ? " (P0 Critical at any time)" : ""}.`}
              />
              <fieldset className="px-5 py-4">
                <legend className="sr-only">Alerts I receive</legend>
                {!s.alertsEnabled ? (
                  <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Alerts are currently turned off for everyone by an administrator.
                  </p>
                ) : null}
                <Radio name="notifyAlerts" value="all" checked={me.notifyAlerts === "all"} label="P0 Critical and P1 High" hint="Every alert." />
                <Radio name="notifyAlerts" value="p0" checked={me.notifyAlerts === "p0"} label="P0 Critical only" hint="Only the most serious stories." />
                <Radio name="notifyAlerts" value="none" checked={me.notifyAlerts === "none"} label="Off" hint="I'll check the dashboard." />
              </fieldset>
            </Card>

            <Card>
              <CardHeader title="Other emails" />
              <div className="space-y-3 px-5 py-4">
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
                      <span className="block text-xs text-muted">When someone asks to join. Requests always appear in Team management.</span>
                    </span>
                  </label>
                ) : null}
                <p className="text-xs text-muted">Security notices, such as a password change, are always sent.</p>
              </div>
            </Card>
          </div>
        </div>
        <SubmitButton pendingText="Saving…">Save my notifications</SubmitButton>
      </ActionForm>

      {canEditRules ? (
        <section aria-labelledby="rules-heading" className="mt-10">
          <div className="mb-3 flex items-center gap-1">
            <h2 id="rules-heading" className="font-serif text-lg font-semibold text-maroon-700">
              Rules for everyone
            </h2>
            <HelpHint topic="alert-rules" label="Rules for everyone" />
          </div>
          <p className="mb-4 text-sm text-muted">Administrators only. These apply to all staff; each person still chooses what they receive above.</p>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="News briefs" description="America/Edmonton time; daylight saving is handled automatically." />
              <ActionForm action={saveSettingsAction} className="grid gap-4 px-5 py-4 sm:grid-cols-2">
                <input type="hidden" name="section" value="digest" />
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <Checkbox name="digestEnabled" defaultChecked={s.digestEnabled} /> Send news briefs
                </label>
                <Field label="Default brief time" htmlFor="digestTime-default" hint="For people who don't choose their own.">
                  <Input id="digestTime-default" name="digestTime" type="time" defaultValue={s.digestTime} required />
                </Field>
                <Field label="Lookback (hours)" htmlFor="digestLookbackHours" hint="Shortest period a brief covers; up to 72 h.">
                  <Input id="digestLookbackHours" name="digestLookbackHours" type="number" min={6} max={72} defaultValue={s.digestLookbackHours} required />
                </Field>
                <div className="sm:col-span-2">
                  <SubmitButton size="sm">Save brief rules</SubmitButton>
                </div>
              </ActionForm>
            </Card>

            <Card>
              <CardHeader title="High-priority alerts" description="Stories found together are batched into one email." />
              <ActionForm action={saveSettingsAction} className="grid gap-4 px-5 py-4 sm:grid-cols-2">
                <input type="hidden" name="section" value="alerts" />
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <Checkbox name="alertsEnabled" defaultChecked={s.alertsEnabled} /> Send high-priority alerts
                </label>
                <Field label="Minimum priority" htmlFor="alertMinPriority" className="sm:col-span-2">
                  <Select id="alertMinPriority" name="alertMinPriority" defaultValue={s.alertMinPriority}>
                    <option value="P1">P1 High and P0 Critical</option>
                    <option value="P0">P0 Critical only</option>
                  </Select>
                </Field>
                <Field label="Alert hours start" htmlFor="alertWindowStart">
                  <Input id="alertWindowStart" name="alertWindowStart" type="time" defaultValue={s.alertWindowStart} required />
                </Field>
                <Field label="Alert hours end" htmlFor="alertWindowEnd">
                  <Input id="alertWindowEnd" name="alertWindowEnd" type="time" defaultValue={s.alertWindowEnd} required />
                </Field>
                <Field label="Max alerts per hour" htmlFor="alertMaxPerHour">
                  <Input id="alertMaxPerHour" name="alertMaxPerHour" type="number" min={1} max={20} defaultValue={s.alertMaxPerHour} required />
                </Field>
                <Field label="Max alerts per day" htmlFor="alertMaxPerDay">
                  <Input id="alertMaxPerDay" name="alertMaxPerDay" type="number" min={1} max={100} defaultValue={s.alertMaxPerDay} required />
                </Field>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <Checkbox name="alertP0BypassWindow" defaultChecked={s.alertP0BypassWindow} /> P0 Critical alerts may be sent outside alert hours
                </label>
                <p className="text-xs text-muted sm:col-span-2">
                  Over the limits, alerts are held and logged, and the stories appear in the next brief. P1 stories found outside alert hours are
                  covered by briefs.
                </p>
                <div className="sm:col-span-2">
                  <SubmitButton size="sm">Save alert rules</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          </div>
        </section>
      ) : null}
    </>
  );
}
