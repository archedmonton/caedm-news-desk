import { eq } from "drizzle-orm";
import { Eye, Inbox, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { retryNotificationAction, runAlertsNowAction, saveDigestPreviewAction, sendBriefNowAction } from "@/actions/notifications";
import { ActionForm, SubmitButton } from "@/components/forms";
import { HelpHint } from "@/components/help";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/story-row";
import { Badge, Button, Card, CardHeader } from "@/components/ui/primitives";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { first, getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { evaluateAlerts } from "@/lib/notify/alerts";
import { briefScheduleLabel } from "@/lib/notify/brief-schedule";
import { liveEmailStatus } from "@/lib/notify/transport";
import { listNotifications } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/time";
import { cn, param } from "@/lib/utils";

export const metadata: Metadata = { title: "Email outbox" };

const STATUS_STYLE: Record<string, string> = {
  simulated: "border-cobalt-100 bg-cobalt-50 text-cobalt-700",
  sent: "border-emerald-200 bg-emerald-50 text-emerald-800",
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  failed: "border-p0/30 bg-p0-soft text-p0",
  skipped: "border-line bg-paper text-muted",
};

const KINDS = [
  { key: "", label: "All" },
  { key: "digest", label: "Team briefs" },
  { key: "brief", label: "Personal briefs" },
  { key: "alert", label: "Alerts" },
  { key: "invite", label: "Invitations" },
  { key: "test", label: "Previews" },
  { key: "assignment", label: "Assignments" },
  { key: "feature_request", label: "Feature requests" },
  { key: "access_request", label: "Access requests" },
  { key: "security", label: "Security" },
];

const KIND_LABEL: Record<string, string> = { digest: "Team brief", brief: "Personal brief", test: "Preview" };

export default async function OutboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const admin = can(user.role, "send_test_notifications");
  const kind = param(await searchParams, "kind");
  // Invitations and access requests contain personal details or sign-up links: administrators only.
  const isAdmin = can(user.role, "manage_staff");
  const rows = (await listNotifications(kind || undefined)).filter((n) => isAdmin || (n.kind !== "invite" && n.kind !== "access_request"));
  const mail = liveEmailStatus();
  const ev = await evaluateAlerts();
  const settings = await getSettings();
  const me = await first(
    getDb()
      .select({ notifyDigest: users.notifyDigest, digestTime: users.digestTime, digestDays: users.digestDays, digestScope: users.digestScope })
      .from(users)
      .where(eq(users.id, user.id)),
  );

  return (
    <>
      <PageHeader
        title="Email outbox"
        description="Every brief, alert and invitation, with its delivery status. Messages are stored even when delivery is simulated."
        actions={
          <Button asChild variant="outline">
            <Link href="/outbox/preview">
              <Eye /> Preview today&apos;s brief
            </Link>
          </Button>
        }
      />
      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1 font-semibold text-ink">
              Your news brief <HelpHint topic="send-now" label="Send me a brief now" />
            </h2>
            <p className="text-sm text-muted">
              {me?.notifyDigest
                ? `Scheduled: ${briefScheduleLabel(me, settings.digestTime)}, ${me.digestScope === "catholic" ? "Catholic news only" : "all monitored news"}.`
                : "No scheduled brief."}{" "}
              <Link href="/account#brief" className="text-cobalt-700 hover:underline">
                {me?.notifyDigest ? "Change" : "Set one up"}
              </Link>
            </p>
          </div>
          <ActionForm action={sendBriefNowAction} className="sm:text-right">
            <SubmitButton pendingText="Sending…">
              <Send /> Send me a brief now
            </SubmitButton>
          </ActionForm>
        </div>
      </Card>
      {!mail.live ? (
        <p role="status" className="mb-4 rounded-lg border border-cobalt-100 bg-cobalt-50 px-4 py-3 text-sm text-cobalt-800">
          <strong>Simulated delivery.</strong> {mail.reason} No real email leaves this system.
        </p>
      ) : null}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Alert dry run" description="What the next alert check would do right now. Read-only." />
          <div className="space-y-3 px-5 py-4 text-sm">
            <p className="text-muted">
              {ev.enabled ? "Alerts enabled" : "Alerts disabled"} · {ev.inWindow ? "inside" : "outside"} alert hours · {ev.sentLastHour} in the last
              hour, {ev.sentLastDay} in the last 24 h
            </p>
            {ev.blockedReason ? <p className="font-medium text-p1">Blocked: {ev.blockedReason}</p> : null}
            <div>
              <div className="font-medium text-ink">Would alert ({ev.eligible.length})</div>
              <ul className="mt-1 space-y-1">
                {ev.eligible.length === 0 ? <li className="text-muted">No qualifying stories.</li> : null}
                {ev.eligible.map((s) => (
                  <li key={s.id}>
                    <Link href={`/news/${s.id}`} className="hover:underline">
                      [{s.priority}] {s.title}
                    </Link>
                    {s.sensitive ? <span className="text-orange-700"> (internal review)</span> : null}
                  </li>
                ))}
              </ul>
            </div>
            {ev.held.length ? (
              <div>
                <div className="font-medium text-ink">Held ({ev.held.length})</div>
                <ul className="mt-1 space-y-1 text-muted">
                  {ev.held.map((s) => (
                    <li key={s.id}>
                      [{s.priority}] {s.title}: {s.held}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {admin ? (
              <ActionForm action={runAlertsNowAction}>
                <SubmitButton size="sm" variant="outline" pendingText="Running…">
                  Run alert check now
                </SubmitButton>
              </ActionForm>
            ) : null}
          </div>
        </Card>
        <Card>
          <CardHeader title="Morning brief" description="Preview the brief without affecting the scheduled delivery." />
          <div className="space-y-3 px-5 py-4 text-sm">
            <p className="text-muted">
              The scheduled brief is generated once per Edmonton day by the worker. A preview never marks stories as delivered, so they will still
              appear in the real brief.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href="/outbox/preview">Open live preview</Link>
              </Button>
              {admin ? (
                <ActionForm action={saveDigestPreviewAction}>
                  <SubmitButton size="sm" variant="outline" pendingText="Saving…">
                    Save preview to outbox
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </div>
          </div>
        </Card>
      </div>

      <nav aria-label="Message types" className="mb-3 flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1 text-sm sm:w-fit">
        {KINDS.map((k) => (
          <Link
            key={k.key}
            href={k.key ? `/outbox?kind=${k.key}` : "/outbox"}
            aria-current={kind === k.key ? "page" : undefined}
            className={cn("rounded-md px-3 py-1.5 text-muted hover:text-ink", kind === k.key && "bg-maroon-700 text-white hover:text-white")}
          >
            {k.label}
          </Link>
        ))}
      </nav>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No messages yet" icon={<Inbox className="size-6" />}>
            Briefs, alerts and invitations will be listed here.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs text-subtle">
                <tr>
                  <th className="px-5 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Subject</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 font-medium">Attempts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((n) => (
                  <tr key={n.id} data-testid="outbox-row">
                    <td className="whitespace-nowrap px-5 py-2.5 text-muted">{formatDateTime(n.createdAt)}</td>
                    <td className={cn("px-3 py-2.5", !KIND_LABEL[n.kind] && "capitalize")}>{KIND_LABEL[n.kind] ?? n.kind.replace("_", " ")}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/outbox/${n.id}`} className="font-medium text-ink hover:text-cobalt-700 hover:underline">
                        {n.subject}
                      </Link>
                      <div className="text-xs text-subtle">to {n.recipient}</div>
                      {n.lastError ? <div className="text-xs text-p0">{n.lastError}</div> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge className={STATUS_STYLE[n.status]}>{n.status}</Badge>
                      {n.status === "failed" && n.nextAttemptAt ? (
                        <div className="mt-1 text-xs text-subtle">retry {formatDateTime(n.nextAttemptAt)}</div>
                      ) : null}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="tabular-nums">{n.attempts}</span>
                      {admin && n.status === "failed" ? (
                        <form action={retryNotificationAction} className="inline">
                          <input type="hidden" name="notificationId" value={n.id} />
                          <SubmitButton variant="link" size="xs" className="ml-2">
                            Retry now
                          </SubmitButton>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
