import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { setStatusAction } from "@/actions/stories";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { SubmitButton } from "@/components/forms";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/story-row";
import { Card } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/session";
import { listFollowUps } from "@/lib/queries";
import { formatDateTime } from "@/lib/time";
import { cn, param } from "@/lib/utils";

export const metadata: Metadata = { title: "Follow-ups" };

const VIEWS = [
  { key: "", label: "Open" },
  { key: "mine", label: "Assigned to me" },
  { key: "covered", label: "Covered" },
  { key: "archived", label: "Archived" },
];

function QuickStatus({ storyId, status, label }: { storyId: number; status: string; label: string }) {
  return (
    <form action={setStatusAction}>
      <input type="hidden" name="storyId" value={storyId} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant={status === "covered" ? "outline" : "ghost"} size="xs">
        {label}
      </SubmitButton>
    </form>
  );
}

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("manage_follow_ups");
  const view = param(await searchParams, "view");
  const rows = listFollowUps({ view: view === "mine" ? "" : view, assignee: view === "mine" ? user.id : undefined });
  const now = Date.now();

  return (
    <>
      <PageHeader title="Follow-ups" description="Stories Communications is acting on. Assign, set due dates and add notes from each story's page." />
      <nav aria-label="Follow-up views" className="mb-4 flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1 text-sm sm:w-fit">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={v.key ? `/follow-ups?view=${v.key}` : "/follow-ups"}
            aria-current={view === v.key ? "page" : undefined}
            className={cn("rounded-md px-3 py-1.5 text-muted hover:text-ink", view === v.key && "bg-navy-700 text-white hover:text-white")}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Nothing here" icon={<ClipboardList className="size-6" />}>
            Use <strong>Assign</strong> on any story in the News Feed to create a follow-up.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const overdue = r.dueAt != null && r.dueAt < now && !r.completedAt;
              return (
                <li key={r.followUpId} className="flex flex-col gap-2 px-5 py-4 md:flex-row md:items-start md:justify-between" data-testid="follow-up-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <PriorityBadge priority={r.priority} compact />
                      <StatusBadge status={r.reviewStatus} />
                      {overdue ? <span className="rounded-full bg-p0 px-2 py-0.5 text-[11px] font-medium text-white">Overdue</span> : null}
                    </div>
                    <Link href={`/news/${r.storyId}#follow-up`} className="mt-1.5 block font-semibold text-ink hover:text-navy-700 hover:underline">
                      {r.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-subtle">
                      {r.sourceName} · <span className="text-muted">{r.assignee || r.assigneeEmail || "Unassigned"}</span> ·{" "}
                      <span className={overdue ? "font-medium text-p0" : ""}>{r.dueAt ? `Due ${formatDateTime(r.dueAt)}` : "No due date"}</span>
                    </p>
                    {r.lastNote ? (
                      <p className="mt-2 line-clamp-2 rounded-md bg-paper px-3 py-2 text-sm text-muted">
                        {r.lastNote}
                        {r.noteCount > 1 ? <span className="text-subtle"> (+{r.noteCount - 1} more)</span> : null}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    {r.reviewStatus === "covered" || r.reviewStatus === "archived" ? (
                      <QuickStatus storyId={r.storyId} status="reviewing" label="Reopen" />
                    ) : (
                      <QuickStatus storyId={r.storyId} status="covered" label="Mark covered" />
                    )}
                    {r.reviewStatus !== "archived" ? <QuickStatus storyId={r.storyId} status="archived" label="Archive" /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
