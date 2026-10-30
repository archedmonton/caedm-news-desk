import { AlertTriangle, ArrowRight, CheckCircle2, CircleAlert, Clock, Inbox, Newspaper } from "lucide-react";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessRequestsCard } from "@/components/access-requests";
import { HealthBadge, sourceHealth } from "@/components/badges";
import { HelpTrigger } from "@/components/help";
import { PageHeader } from "@/components/page-header";
import { EmptyState, StoryRow } from "@/components/story-row";
import { Card, CardHeader } from "@/components/ui/primitives";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { getOverview } from "@/lib/queries";
import { listAccessRequests } from "@/lib/requests";
import { first, getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { briefScheduleLabel } from "@/lib/notify/brief-schedule";
import { getSettings } from "@/lib/settings";
import { formatDateTime, formatLongDate, formatRelative } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

function Stat({ label, value, sub, href, tone }: { label: string; value: number | string; sub?: string; href: string; tone?: "alert" | "warn" }) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-line bg-surface px-4 py-4 transition-colors hover:border-maroon-100 hover:bg-maroon-50/40"
    >
      <div className="text-[13px] text-muted">{label}</div>
      <div
        className={cn("mt-1 font-serif text-3xl font-semibold tabular-nums text-ink", tone === "alert" && "text-p0", tone === "warn" && "text-p1")}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-subtle">{sub}</div> : null}
    </Link>
  );
}

export default async function OverviewPage() {
  const user = await requireUser();
  const now = Date.now();
  const o = await getOverview(user.email, now);
  const me = (await first(getDb().select().from(users).where(eq(users.id, user.id))))!;
  const requests = can(user.role, "manage_staff") ? await listAccessRequests("dashboard") : [];
  const canReview = can(user.role, "review_news");
  const settings = await getSettings();
  const healthy = o.sources.filter((s) => sourceHealth(s) === "healthy").length;
  const enabled = o.sources.filter((s) => s.enabled);
  const problems = enabled.filter((s) => ["degraded", "failing"].includes(sourceHealth(s)));
  // The daily cron (~8 AM) plus live refresh while staff are signed in keep this well under a day.
  const refreshStale = !!o.tick && now - o.tick.lastTickAt > 26 * 3600_000;

  return (
    <>
      <PageHeader
        title="Overview"
        description={`${formatLongDate(now)} · Edmonton`}
        actions={
          <>
            <HelpTrigger label="Help: about this dashboard" />
            <HelpTrigger view="feature" variant="ghost" />
          </>
        }
      />

      {requests.length ? (
        <div className="mb-6">
          <AccessRequestsCard rows={requests} title="People asking to join" />
        </div>
      ) : null}

      {refreshStale || problems.length || o.failedDeliveries ? (
        <div className="mb-6 space-y-2">
          {refreshStale && o.tick ? (
            <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <Clock className="mt-0.5 size-4 shrink-0" />
              <span>
                The scheduled refresh last ran {formatRelative(o.tick.lastTickAt, now)}. The daily 8 AM run may not be reaching the app; an
                administrator should check the Vercel Cron logs and the CRON_SECRET setting.
              </span>
            </div>
          ) : null}
          {problems.length ? (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-p0/25 bg-p0-soft px-4 py-3 text-sm text-p0">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                {problems.map((p) => p.name).join(", ")} {problems.length === 1 ? "is" : "are"} reporting errors.{" "}
                <Link href="/sources" className="underline">
                  View sources
                </Link>
              </span>
            </div>
          ) : null}
          {o.failedDeliveries ? (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-p0/25 bg-p0-soft px-4 py-3 text-sm text-p0">
              <Inbox className="mt-0.5 size-4 shrink-0" />
              <span>
                {o.failedDeliveries} email {o.failedDeliveries === 1 ? "delivery has" : "deliveries have"} failed in the last 7 days.{" "}
                <Link href="/outbox" className="underline">
                  Open outbox
                </Link>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat
          label="New stories (24 h)"
          value={o.newStories}
          sub={o.newTotal24h > o.newStories ? `${o.newTotal24h - o.newStories} more from first-time source sync` : `${o.unreviewed} awaiting review`}
          href="/news?sort=detected"
        />
        <Stat
          label="High-priority open"
          value={o.highOpen}
          sub="P0 / P1 not yet covered"
          href="/news?priority=high&status=open&sort=priority"
          tone={o.highOpen ? "alert" : undefined}
        />
        <Stat
          label="Needs review"
          value={o.needsReview}
          sub="Sensitive or unverified"
          href="/news?review=1&status=new"
          tone={o.needsReview ? "warn" : undefined}
        />
        <Stat
          label="Open follow-ups"
          value={o.openFollowUps}
          sub={o.overdueFollowUps ? `${o.overdueFollowUps} overdue` : "None overdue"}
          href="/follow-ups"
          tone={o.overdueFollowUps ? "alert" : undefined}
        />
        <Stat
          label="Sources healthy"
          value={`${healthy}/${enabled.length}`}
          sub={problems.length ? `${problems.length} with errors` : "All monitored sources OK"}
          href="/sources"
          tone={problems.length ? "warn" : undefined}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="High-priority alerts"
              description="P0 and P1 stories that are not yet covered or archived"
              action={
                <Link href="/news?priority=high&status=open&sort=priority" className="flex items-center gap-1 text-sm text-cobalt-700 hover:underline">
                  All <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            {o.highPriority.length ? (
              <div className="divide-y divide-line">
                {o.highPriority.map((s) => (
                  <StoryRow key={s.id} s={s} canReview={canReview} />
                ))}
              </div>
            ) : (
              <EmptyState title="No open high-priority stories" icon={<CheckCircle2 className="size-6" />}>
                New P0/P1 developments will appear here and trigger an email alert during alert hours.
              </EmptyState>
            )}
          </Card>
          <Card>
            <CardHeader
              title="Recent relevant articles"
              description="P0–P2 stories published in the last 72 hours"
              action={
                <Link href="/news" className="flex items-center gap-1 text-sm text-cobalt-700 hover:underline">
                  News Feed <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            {o.recent.length ? (
              <div className="divide-y divide-line">
                {o.recent.map((s) => (
                  <StoryRow key={s.id} s={s} actions={false} />
                ))}
              </div>
            ) : (
              <EmptyState title="No recent stories" icon={<Newspaper className="size-6" />}>
                Stories appear after sources are checked. An administrator can run a check from the Sources page.
              </EmptyState>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="My news brief"
              description={me.notifyDigest ? `${briefScheduleLabel(me, settings.digestTime)} to ${me.email}` : `Off. Turn it on to get news at ${me.email}.`}
            />
            <div className="space-y-3 px-5 py-4 text-sm">
              {!settings.digestEnabled ? <p className="text-p1">News briefs are turned off for everyone by an administrator.</p> : null}
              {o.lastDigest ? (
                <div>
                  <div className="text-muted">Latest</div>
                  <Link href={`/outbox/${o.lastDigest.id}`} className="font-medium text-ink hover:underline">
                    {o.lastDigest.subject}
                  </Link>
                  <div className="text-xs text-subtle">
                    {formatDateTime(o.lastDigest.createdAt)} · <span className="capitalize">{o.lastDigest.status}</span>
                    {o.lastDigest.lastError ? ` · ${o.lastDigest.lastError}` : ""}
                  </div>
                </div>
              ) : (
                <p className="text-muted">No brief has been sent to you yet.</p>
              )}
              <div>
                <div className="text-muted">Latest alert to you</div>
                <div className="text-ink">{o.lastAlert ? `${formatDateTime(o.lastAlert.createdAt)} · ${o.lastAlert.status}` : "None sent"}</div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <Link href="/notifications" className="inline-flex items-center gap-1 text-cobalt-700 hover:underline">
                  Notifications &amp; alerts <ArrowRight className="size-3.5" />
                </Link>
                <Link href="/outbox/preview" className="inline-flex items-center gap-1 text-cobalt-700 hover:underline">
                  Preview my brief <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Source monitoring" />
            <ul className="divide-y divide-line">
              {o.sources.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{s.name}</div>
                    <div className="text-xs text-subtle">Last success {formatRelative(s.lastSuccessAt, now)}</div>
                  </div>
                  <HealthBadge health={sourceHealth(s)} />
                </li>
              ))}
            </ul>
          </Card>
          {o.needsReview ? (
            <Link
              href="/news?review=1&status=new"
              className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900 hover:bg-orange-100/60"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {o.needsReview} {o.needsReview === 1 ? "story involves" : "stories involve"} sensitive or unverified claims and need human review before
              any external use.
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}
