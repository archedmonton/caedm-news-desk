import { Archive, Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import { setStatusAction } from "@/actions/stories";
import { CategoryBadge, PriorityBadge, SampleBadge, StatusBadge, VerificationBadge } from "@/components/badges";
import { SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/primitives";
import type { StoryListItem } from "@/lib/queries";
import { formatDateTime } from "@/lib/time";

function StatusButton({ storyId, status, label, icon }: { storyId: number; status: string; label: string; icon: React.ReactNode }) {
  return (
    <form action={setStatusAction}>
      <input type="hidden" name="storyId" value={storyId} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant="ghost" size="xs" aria-label={`${label}: story ${storyId}`}>
        {icon}
        {label}
      </SubmitButton>
    </form>
  );
}

export function StoryRow({ s, actions = true }: { s: StoryListItem; actions?: boolean }) {
  const when = s.publishedAt ?? s.firstDetectedAt;
  return (
    <article className="group flex flex-col gap-2 px-5 py-4" data-testid="story-row">
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={s.priority} overridden={s.priorityOverridden} />
        <StatusBadge status={s.reviewStatus} />
        <CategoryBadge category={s.category} />
        <VerificationBadge status={s.verificationStatus} sensitive={s.sensitive} />
        {s.isSample ? <SampleBadge /> : null}
      </div>
      <h3 className="text-[15px] font-semibold leading-snug text-ink">
        <Link href={`/news/${s.id}`} className="hover:text-navy-700 hover:underline">
          {s.title}
        </Link>
      </h3>
      {s.description ? <p className="line-clamp-2 text-sm leading-relaxed text-muted">{s.description}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-subtle">
          <span className="font-medium text-muted">{s.sourceName}</span> · {s.publishedAt ? formatDateTime(when) : `Detected ${formatDateTime(when)}`}
        </p>
        {actions ? (
          <div className="flex flex-wrap items-center gap-0.5">
            <Button asChild variant="ghost" size="xs">
              <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label={`Open original source: ${s.title}`}>
                <ExternalLink /> Original
              </a>
            </Button>
            {s.reviewStatus === "new" ? <StatusButton storyId={s.id} status="reviewing" label="Mark reviewed" icon={<Check />} /> : null}
            <Button asChild variant="ghost" size="xs">
              <Link href={`/news/${s.id}#follow-up`}>Assign</Link>
            </Button>
            {s.reviewStatus !== "archived" ? <StatusButton storyId={s.id} status="archived" label="Archive" icon={<Archive />} /> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-subtle">{icon}</div> : null}
      <p className="font-medium text-ink">{title}</p>
      {children ? <div className="mt-1 max-w-md text-sm text-muted">{children}</div> : null}
    </div>
  );
}
