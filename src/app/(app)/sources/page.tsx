import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { checkSourceNowAction, toggleSourceAction } from "@/actions/admin";
import { HealthBadge, sourceHealth } from "@/components/badges";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/primitives";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { listSources, recentCheckLogs } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { formatDateTime, formatRelative } from "@/lib/time";

export const metadata: Metadata = { title: "Sources" };

const METHOD_LABEL: Record<string, string> = { rss: "RSS feed", html: "Newsroom page", manual: "Manual submission" };

export default async function SourcesPage() {
  const user = await requireUser();
  const isAdmin = can(user.role, "manage_sources");
  const all = listSources();
  const monitored = all.filter((s) => s.verified);
  const expansion = all.filter((s) => !s.verified);
  const logs = recentCheckLogs(25);
  const interval = getSettings().checkIntervalMinutes;
  const now = Date.now();

  return (
    <>
      <PageHeader
        title="Sources"
        description={`Verified sources are checked every ${interval} minutes by the background worker, with exponential backoff after failures.`}
      />
      <div className="space-y-4">
        {monitored.map((s) => {
          const health = sourceHealth(s);
          return (
            <Card key={s.id} data-testid="source-card">
              <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-ink">{s.name}</h2>
                    <HealthBadge health={health} />
                  </div>
                  <a href={s.websiteUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-sm text-navy-700 hover:underline">
                    {s.websiteUrl} <ExternalLink className="size-3" />
                  </a>
                  <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-subtle">Connection</dt>
                      <dd>{METHOD_LABEL[s.method]}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-subtle">Last successful check</dt>
                      <dd title={formatDateTime(s.lastSuccessAt)}>{s.method === "manual" ? "n/a" : formatRelative(s.lastSuccessAt, now)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-subtle">Latest article</dt>
                      <dd>{s.lastArticleAt ? formatDateTime(s.lastArticleAt) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-subtle">Stories stored</dt>
                      <dd>{s.storyCount}</dd>
                    </div>
                    {s.enabled && s.method !== "manual" ? (
                      <div>
                        <dt className="text-xs text-subtle">Next check</dt>
                        <dd>{s.nextCheckAt ? formatDateTime(s.nextCheckAt) : "On next worker run"}</dd>
                      </div>
                    ) : null}
                    {s.consecutiveFailures ? (
                      <div>
                        <dt className="text-xs text-subtle">Consecutive failures</dt>
                        <dd className="text-p0">{s.consecutiveFailures}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {s.lastError ? (
                    <p role="alert" className="mt-3 rounded-md border border-p0/20 bg-p0-soft px-3 py-2 text-sm text-p0">
                      {s.lastError}
                    </p>
                  ) : null}
                  {s.feedUrl ? <p className="mt-3 break-all text-xs text-subtle">Monitored URL: {s.feedUrl}</p> : null}
                  {s.notes ? <p className="mt-1 text-xs text-subtle">{s.notes}</p> : null}
                </div>
                {isAdmin && s.method !== "manual" ? (
                  <div className="flex shrink-0 flex-col items-stretch gap-2 md:w-44">
                    <form action={toggleSourceAction}>
                      <input type="hidden" name="sourceId" value={s.id} />
                      <input type="hidden" name="enabled" value={s.enabled ? "false" : "true"} />
                      <SubmitButton variant={s.enabled ? "outline" : "default"} size="sm" className="w-full">
                        {s.enabled ? "Disable monitoring" : "Enable monitoring"}
                      </SubmitButton>
                    </form>
                    <ActionForm action={checkSourceNowAction}>
                      <input type="hidden" name="sourceId" value={s.id} />
                      <SubmitButton variant="outline" size="sm" className="w-full" pendingText="Checking…">
                        Check now
                      </SubmitButton>
                    </ActionForm>
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-8">
        <CardHeader title="Recent checks" description="Most recent 25 source checks" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs text-subtle">
              <tr>
                <th className="px-5 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Result</th>
                <th className="px-3 py-2 font-medium">Found / new</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                <th className="px-5 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-muted">
                    No checks yet.
                  </td>
                </tr>
              ) : null}
              {logs.map(({ l, name }) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap px-5 py-2 text-muted">{formatDateTime(l.startedAt)}</td>
                  <td className="px-3 py-2">{name}</td>
                  <td className={`px-3 py-2 font-medium ${l.status === "success" ? "text-emerald-700" : "text-p0"}`}>
                    {l.status === "success" ? "OK" : "Error"}
                    {l.httpStatus ? <span className="font-normal text-subtle"> · {l.httpStatus}</span> : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {l.itemsFound} / {l.itemsNew}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted">{l.durationMs != null ? `${(l.durationMs / 1000).toFixed(1)} s` : "—"}</td>
                  <td className="max-w-xs truncate px-5 py-2 text-xs text-muted" title={l.error ?? ""}>
                    {l.error ?? `${l.trigger === "manual" ? "Manual" : "Scheduled"} check`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-8">
        <CardHeader
          title="Expansion registry"
          description="Planned sources. They can't be enabled until someone verifies an official feed or newsroom, robots.txt and publisher terms, and an adapter is configured."
        />
        <ul className="divide-y divide-line">
          {expansion.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium text-ink">{s.name}</div>
                <a href={s.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted hover:underline">
                  {s.websiteUrl}
                </a>
              </div>
              <HealthBadge health="unverified" />
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
