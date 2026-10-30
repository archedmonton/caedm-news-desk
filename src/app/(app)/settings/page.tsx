import type { Metadata } from "next";
import Link from "next/link";
import { reclassifyAction, savePriorityRulesAction, saveSettingsAction } from "@/actions/admin";
import { setFeatureRequestStatusAction } from "@/actions/requests";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PageHeader } from "@/components/page-header";
import { Badge, Card, CardHeader, Checkbox, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { productionAccess } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { FEATURE_REQUEST_STATUSES } from "@/lib/db/schema";
import { developerContact } from "@/lib/developer";
import { FEATURE_CATEGORY_LABELS, FEATURE_IMPORTANCE_LABELS, listFeatureRequests } from "@/lib/requests";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { liveEmailStatus } from "@/lib/notify/transport";
import { RULE_LIST_KEYS, RULE_LIST_LABELS } from "@/lib/priority/rules";
import { recentAudit } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const admin = can(user.role, "manage_settings");
  const s = await getSettings();
  const mail = liveEmailStatus();
  const access = productionAccess();
  const audit = admin ? await recentAudit(40) : [];
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
            <CardHeader title="Elsewhere" description="Email and people settings have their own pages." />
            <ul className="space-y-3 px-5 py-4 text-sm">
              <li>
                <Link href="/notifications" className="font-medium text-cobalt-700 hover:underline">
                  Notifications &amp; alerts
                </Link>
                <span className="block text-xs text-muted">Your own brief and alerts{admin ? ", plus brief and alert rules for everyone" : ""}.</span>
              </li>
              {admin ? (
                <li>
                  <Link href="/team" className="font-medium text-cobalt-700 hover:underline">
                    Team management
                  </Link>
                  <span className="block text-xs text-muted">Invite people, change roles, approve access requests, disable or delete accounts.</span>
                </li>
              ) : null}
            </ul>
          </Card>
        </div>

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
