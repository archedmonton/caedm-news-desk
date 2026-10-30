import type { Metadata } from "next";
import {
  inviteStaffAction,
  reclassifyAction,
  savePriorityRulesAction,
  saveSettingsAction,
  deleteStaffAction,
  setStaffRoleAction,
  setStaffStatusAction,
} from "@/actions/admin";
import { setFeatureRequestStatusAction } from "@/actions/requests";
import { AccessRequestsCard } from "@/components/access-requests";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { PageHeader } from "@/components/page-header";
import { Badge, Card, CardHeader, Checkbox, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { productionAccess } from "@/lib/auth/access";
import { can, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/permissions";
import { FEATURE_REQUEST_STATUSES, ROLES } from "@/lib/db/schema";
import { developerContact } from "@/lib/developer";
import { FEATURE_CATEGORY_LABELS, FEATURE_IMPORTANCE_LABELS, listAccessRequests, listFeatureRequests } from "@/lib/requests";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { liveEmailStatus } from "@/lib/notify/transport";
import { RULE_LIST_KEYS, RULE_LIST_LABELS } from "@/lib/priority/rules";
import { listStaff, recentAudit } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const admin = can(user.role, "manage_settings");
  const s = await getSettings();
  const mail = liveEmailStatus();
  const access = productionAccess();
  const staff = admin ? await listStaff() : [];
  const audit = admin ? await recentAudit(40) : [];
  const requests = admin ? await listAccessRequests("all") : [];
  const features = admin ? await listFeatureRequests() : [];
  const developer = developerContact();
  const ro = !admin;

  return (
    <>
      <PageHeader title="Settings" description={admin ? "Changes are audit-logged." : "Only administrators can change settings."} />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Email delivery" description="Set by IT through environment variables. Not editable here." />
          <div className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-subtle">Mode</div>
              <div className="mt-1">
                {mail.live ? (
                  <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">Live: {mail.transport}</Badge>
                ) : (
                  <Badge className="border-amber-200 bg-amber-50 text-amber-800">Simulated (outbox only)</Badge>
                )}
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-subtle">Status</div>
              <div className="mt-1 text-ink">{mail.reason}</div>
            </div>
            <div className="sm:col-span-3">
              <div className="text-xs text-subtle">Production sign-in</div>
              <div className="mt-1 text-ink">
                {env().NODE_ENV === "production"
                  ? access.enabled
                    ? "Enabled"
                    : `Disabled: ${access.reason}`
                  : "Development mode (production gate not applied)"}
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Monitoring" />
            <ActionForm action={saveSettingsAction} className="space-y-4 px-5 py-4">
              <input type="hidden" name="section" value="monitoring" />
              <Field
                label="Refresh sources while staff are signed in (minutes)"
                htmlFor="checkIntervalMinutes"
                hint="15–1440. Sources are also refreshed every morning before the brief. Applies to every source without its own interval."
              >
                <Input
                  id="checkIntervalMinutes"
                  name="checkIntervalMinutes"
                  type="number"
                  min={15}
                  max={1440}
                  defaultValue={s.checkIntervalMinutes}
                  disabled={ro}
                  required
                />
              </Field>
              {admin ? <SubmitButton size="sm">Save monitoring</SubmitButton> : null}
            </ActionForm>
          </Card>

          <Card>
            <CardHeader
              title="Daily briefing"
              description="America/Edmonton time; daylight saving is handled automatically. The scheduled run starts at 8 AM and the brief is sent within that hour."
            />
            <ActionForm action={saveSettingsAction} className="grid gap-4 px-5 py-4 sm:grid-cols-2">
              <input type="hidden" name="section" value="digest" />
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox name="digestEnabled" defaultChecked={s.digestEnabled} disabled={ro} /> Send the morning brief
              </label>
              <Field label="Send time" htmlFor="digestTime">
                <Input id="digestTime" name="digestTime" type="time" defaultValue={s.digestTime} disabled={ro} required />
              </Field>
              <Field label="Lookback (hours)" htmlFor="digestLookbackHours" hint="Minimum window; extends back to the last brief, up to 72 h.">
                <Input
                  id="digestLookbackHours"
                  name="digestLookbackHours"
                  type="number"
                  min={6}
                  max={72}
                  defaultValue={s.digestLookbackHours}
                  disabled={ro}
                  required
                />
              </Field>
              <Field label="Recipient" htmlFor="digestRecipient" className="sm:col-span-2">
                <Input id="digestRecipient" name="digestRecipient" type="email" defaultValue={s.digestRecipient} disabled={ro} required />
              </Field>
              {admin ? (
                <div className="sm:col-span-2">
                  <SubmitButton size="sm">Save briefing</SubmitButton>
                </div>
              ) : null}
            </ActionForm>
          </Card>
        </div>

        <Card>
          <CardHeader title="High-priority alerts" description="Separate emails during the day for qualifying P0/P1 stories only" />
          <ActionForm action={saveSettingsAction} className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="section" value="alerts" />
            <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
              <Checkbox name="alertsEnabled" defaultChecked={s.alertsEnabled} disabled={ro} /> Send high-priority alerts
            </label>
            <Field label="Recipient" htmlFor="alertRecipient" className="sm:col-span-2">
              <Input id="alertRecipient" name="alertRecipient" type="email" defaultValue={s.alertRecipient} disabled={ro} required />
            </Field>
            <Field label="Minimum priority" htmlFor="alertMinPriority" className="sm:col-span-2">
              <Select id="alertMinPriority" name="alertMinPriority" defaultValue={s.alertMinPriority} disabled={ro}>
                <option value="P1">P1 High and P0 Critical</option>
                <option value="P0">P0 Critical only</option>
              </Select>
            </Field>
            <Field label="Alert hours start" htmlFor="alertWindowStart">
              <Input id="alertWindowStart" name="alertWindowStart" type="time" defaultValue={s.alertWindowStart} disabled={ro} required />
            </Field>
            <Field label="Alert hours end" htmlFor="alertWindowEnd">
              <Input id="alertWindowEnd" name="alertWindowEnd" type="time" defaultValue={s.alertWindowEnd} disabled={ro} required />
            </Field>
            <Field label="Max alerts per hour" htmlFor="alertMaxPerHour">
              <Input
                id="alertMaxPerHour"
                name="alertMaxPerHour"
                type="number"
                min={1}
                max={20}
                defaultValue={s.alertMaxPerHour}
                disabled={ro}
                required
              />
            </Field>
            <Field label="Max alerts per day" htmlFor="alertMaxPerDay">
              <Input
                id="alertMaxPerDay"
                name="alertMaxPerDay"
                type="number"
                min={1}
                max={100}
                defaultValue={s.alertMaxPerDay}
                disabled={ro}
                required
              />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
              <Checkbox name="alertP0BypassWindow" defaultChecked={s.alertP0BypassWindow} disabled={ro} /> P0 Critical alerts may be sent outside
              alert hours
            </label>
            <p className="text-xs text-muted sm:col-span-2 lg:col-span-4">
              Stories found together are batched into one email. Over the limits, alerts are suppressed and logged, and the stories appear in the next
              brief. P1 stories found outside alert hours are covered by the morning brief.
            </p>
            {admin ? (
              <div className="sm:col-span-2 lg:col-span-4">
                <SubmitButton size="sm">Save alerts</SubmitButton>
              </div>
            ) : null}
          </ActionForm>
        </Card>

        <Card>
          <CardHeader
            title="Priority rules"
            description="A deterministic, explainable classifier. Terms are case-insensitive; one per line. A trailing * matches word endings, and a leading ^ matches the start of the headline."
          />
          <ActionForm action={savePriorityRulesAction} className="space-y-4 px-5 py-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="High (P1) threshold" htmlFor="highThreshold">
                <Input id="highThreshold" name="highThreshold" type="number" defaultValue={s.priorityRules.highThreshold} disabled={ro} required />
              </Field>
              <Field label="Standard (P2) threshold" htmlFor="standardThreshold">
                <Input
                  id="standardThreshold"
                  name="standardThreshold"
                  type="number"
                  defaultValue={s.priorityRules.standardThreshold}
                  disabled={ro}
                  required
                />
              </Field>
              <Field label="P0 recency window (hours)" htmlFor="criticalWindowHours">
                <Input
                  id="criticalWindowHours"
                  name="criticalWindowHours"
                  type="number"
                  defaultValue={s.priorityRules.criticalWindowHours}
                  disabled={ro}
                  required
                />
              </Field>
            </div>
            <details className="rounded-lg border border-line">
              <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">Keyword lists ({RULE_LIST_KEYS.length})</summary>
              <div className="grid gap-4 border-t border-line p-4 md:grid-cols-2">
                {RULE_LIST_KEYS.map((k) => (
                  <Field key={k} label={RULE_LIST_LABELS[k]} htmlFor={k}>
                    <Textarea id={k} name={k} rows={5} defaultValue={s.priorityRules[k].join("\n")} disabled={ro} className="font-mono text-xs" />
                  </Field>
                ))}
              </div>
            </details>
            {admin ? (
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="reclassify" defaultChecked /> Re-classify existing stories (manual overrides are kept)
                </label>
                <SubmitButton size="sm" pendingText="Saving…">
                  Save rules
                </SubmitButton>
              </div>
            ) : null}
          </ActionForm>
          {admin ? (
            <ActionForm action={reclassifyAction} className="border-t border-line px-5 py-3">
              <SubmitButton variant="ghost" size="sm" pendingText="Re-classifying…">
                Re-run classification on all stories
              </SubmitButton>
            </ActionForm>
          ) : null}
        </Card>

        {admin ? (
          <>
            <Card>
              <CardHeader
                title="Staff access"
                description={`Invitation only: administrators add people. Only @${env().ALLOWED_EMAIL_DOMAIN} work emails can be invited. Administrators can promote anyone, including to Administrator, but can't change or delete their own account here.`}
              />
              <dl className="grid gap-x-6 gap-y-2 border-b border-line px-5 py-4 text-xs sm:grid-cols-3">
                {ROLES.map((r) => (
                  <div key={r}>
                    <dt className="font-semibold text-ink">{ROLE_LABELS[r]}</dt>
                    <dd className="text-muted">{ROLE_DESCRIPTIONS[r]}</dd>
                  </div>
                ))}
              </dl>
              <ActionForm
                action={inviteStaffAction}
                resetOnSuccess
                className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-end"
              >
                <Field label="Full name" htmlFor="invite-name" className="flex-1">
                  <Input id="invite-name" name="name" required maxLength={100} placeholder="e.g. Maria Santos" autoComplete="off" />
                </Field>
                <Field label="Work email" htmlFor="invite-email" className="flex-1">
                  <Input id="invite-email" name="email" type="email" required placeholder={`name@${env().ALLOWED_EMAIL_DOMAIN}`} autoComplete="off" />
                </Field>
                <Field label="Role" htmlFor="invite-role">
                  <Select id="invite-role" name="role" defaultValue="member">
                    {[...ROLES].reverse().map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <SubmitButton pendingText="Inviting…">Send invitation</SubmitButton>
              </ActionForm>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line text-xs text-subtle">
                    <tr>
                      <th className="px-5 py-2 font-medium">Person</th>
                      <th className="px-3 py-2 font-medium">Role</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Last sign-in</th>
                      <th className="px-5 py-2 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {staff.map((u) => (
                      <tr key={u.id}>
                        <td className="px-5 py-2.5">
                          <div className="font-medium text-ink">
                            {u.name || "—"}
                            {u.id === user.id ? <span className="ml-1 text-xs font-normal text-muted">(you)</span> : null}
                            {u.isDeveloper ? <Badge className="ml-2 border-gold-300 bg-gold-100 text-gold-800">Developer</Badge> : null}
                          </div>
                          <div className="text-xs text-muted">{u.email}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <form action={setStaffRoleAction} className="flex items-center gap-1">
                            <input type="hidden" name="userId" value={u.id} />
                            <Select
                              name="role"
                              defaultValue={u.role}
                              aria-label={`Role for ${u.email}`}
                              className="h-8 w-40 text-xs"
                              disabled={u.id === user.id || u.isDeveloper}
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </option>
                              ))}
                            </Select>
                            {u.id !== user.id && !u.isDeveloper ? (
                              <SubmitButton variant="ghost" size="xs">
                                Save
                              </SubmitButton>
                            ) : null}
                          </form>
                        </td>
                        <td className="px-3 py-2.5 capitalize">{u.status}</td>
                        <td className="px-3 py-2.5 text-muted">{formatDateTime(u.lastLoginAt)}</td>
                        <td className="px-5 py-2.5 text-right">
                          {u.id !== user.id && !u.isDeveloper ? (
                            <div className="flex items-center justify-end gap-1">
                              {u.status !== "invited" ? (
                                <form action={setStaffStatusAction}>
                                  <input type="hidden" name="userId" value={u.id} />
                                  <input type="hidden" name="status" value={u.status === "disabled" ? "active" : "disabled"} />
                                  <SubmitButton variant="ghost" size="xs">
                                    {u.status === "disabled" ? "Re-enable" : "Disable"}
                                  </SubmitButton>
                                </form>
                              ) : null}
                              <form action={deleteStaffAction} aria-label={`Delete ${u.email}`}>
                                <input type="hidden" name="userId" value={u.id} />
                                <ConfirmSubmit
                                  label={u.status === "invited" ? "Cancel invite" : "Delete"}
                                  confirmLabel={u.status === "invited" ? "Confirm cancel" : "Confirm delete"}
                                  pendingText="Deleting…"
                                />
                              </form>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-line px-5 py-3 text-xs text-muted">
                <strong className="text-ink">Disable</strong> pauses someone&apos;s access and can be undone. <strong className="text-ink">Delete</strong>{" "}
                removes the account permanently: their follow-ups become unassigned, their notes and history are kept, and the address can be invited
                again later.
              </p>
            </Card>

            {requests.length ? <AccessRequestsCard rows={requests} title="Access requests (history)" /> : null}

            <Card id="feature-requests">
              <CardHeader title="Feature requests" description={`Sent to the developer, ${developer.name} (${developer.email}).`} />
              {features.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted">No feature requests yet. Anyone can send one from Help &amp; support.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {features.map(({ f, delivery }) => (
                    <li key={f.id} className="flex flex-col gap-2 px-5 py-3 text-sm md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="font-medium text-ink">
                          #{f.id} {f.title}
                        </div>
                        <div className="text-xs text-muted">
                          {FEATURE_CATEGORY_LABELS[f.category]} · {FEATURE_IMPORTANCE_LABELS[f.importance]} · {f.requesterEmail} ·{" "}
                          {formatDateTime(f.createdAt)} · email {delivery ?? "not sent"}
                        </div>
                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-muted">{f.description}</p>
                      </div>
                      <form action={setFeatureRequestStatusAction} className="flex shrink-0 items-center gap-1">
                        <input type="hidden" name="requestId" value={f.id} />
                        <Select name="status" defaultValue={f.status} aria-label={`Status of request ${f.id}`} className="h-8 w-36 text-xs">
                          {FEATURE_REQUEST_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {st[0].toUpperCase() + st.slice(1)}
                            </option>
                          ))}
                        </Select>
                        <SubmitButton variant="ghost" size="xs">
                          Save
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title="Audit log" description="Most recent 40 actions" />
              <ul className="divide-y divide-line text-sm">
                {audit.map(({ a, by, byEmail }) => (
                  <li key={a.id} className="flex flex-wrap justify-between gap-2 px-5 py-2">
                    <span>
                      <span className="font-medium text-ink">{a.action}</span>{" "}
                      <span className="text-muted">
                        {a.entityType}
                        {a.entityId ? ` #${a.entityId}` : ""} by {by || byEmail || (a.details?.formerUser as string | undefined) || "system"}
                      </span>
                    </span>
                    <span className="text-xs text-subtle">{formatDateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        ) : null}
      </div>
    </>
  );
}
