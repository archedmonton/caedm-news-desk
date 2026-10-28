import { Newspaper, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { submitLinkAction } from "@/actions/stories";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PageHeader } from "@/components/page-header";
import { EmptyState, StoryRow } from "@/components/story-row";
import { Button, Card, Field, Input, Select } from "@/components/ui/primitives";
import { listSourceOptions, listStories } from "@/lib/queries";
import { param } from "@/lib/utils";

export const metadata: Metadata = { title: "News Feed" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function NewsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const f = {
    q: param(sp, "q"),
    source: param(sp, "source"),
    priority: param(sp, "priority"),
    status: param(sp, "status"),
    from: param(sp, "from"),
    to: param(sp, "to"),
    sort: param(sp, "sort"),
    review: param(sp, "review"),
    page: Number(param(sp, "page")) || 1,
  };
  const { items, total, page, pages } = listStories(f);
  const sourceOptions = listSourceOptions();
  const hasFilters = Boolean(f.q || f.source || f.priority || f.status || f.from || f.to || f.review);
  const pageHref = (p: number) => {
    const qs = new URLSearchParams(Object.entries({ ...f, page: String(p) }).filter(([, v]) => v && v !== "1") as [string, string][]);
    return `/news${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader title="News Feed" description="Stories from monitored sources, prioritized for Communications review." />

      <Card className="mb-4 p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 [&>*]:min-w-0" role="search" aria-label="Filter stories">
          <div className="relative sm:col-span-2">
            <label htmlFor="q" className="sr-only">
              Search
            </label>
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-subtle" aria-hidden />
            <Input id="q" name="q" defaultValue={f.q} placeholder="Search headlines and summaries" className="pl-9" />
          </div>
          <Select name="source" defaultValue={f.source} aria-label="Source">
            <option value="">All sources</option>
            {sourceOptions.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select name="priority" defaultValue={f.priority} aria-label="Priority">
            <option value="">All priorities</option>
            <option value="high">P0 + P1</option>
            <option value="P0">P0 Critical</option>
            <option value="P1">P1 High</option>
            <option value="P2">P2 Standard</option>
            <option value="P3">P3 Background</option>
          </Select>
          <Select name="status" defaultValue={f.status} aria-label="Review status">
            <option value="">Not archived</option>
            <option value="open">Open (new, reviewing, assigned)</option>
            <option value="new">New</option>
            <option value="reviewing">Reviewing</option>
            <option value="assigned">Assigned</option>
            <option value="covered">Covered</option>
            <option value="archived">Archived</option>
          </Select>
          <Select name="sort" defaultValue={f.sort} aria-label="Sort">
            <option value="">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="priority">Priority</option>
            <option value="detected">Recently detected</option>
          </Select>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:col-span-2">
            <label htmlFor="from" className="text-xs text-muted">
              From
            </label>
            <Input id="from" type="date" name="from" defaultValue={f.from} />
            <label htmlFor="to" className="text-xs text-muted">
              to
            </label>
            <Input id="to" type="date" name="to" defaultValue={f.to} />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="review" value="1" defaultChecked={f.review === "1"} className="size-4 accent-navy-700" />
            Needs review only
          </label>
          <div className="flex gap-2 lg:col-span-3 lg:justify-end">
            <Button type="submit">Apply</Button>
            {hasFilters ? (
              <Button asChild variant="outline">
                <Link href="/news">Clear</Link>
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <div className="mb-2 flex items-center justify-between text-sm text-muted">
        <span aria-live="polite">
          {total} {total === 1 ? "story" : "stories"}
          {pages > 1 ? ` · page ${page} of ${pages}` : ""}
        </span>
      </div>

      <Card>
        {items.length ? (
          <div className="divide-y divide-line">{items.map((s) => <StoryRow key={s.id} s={s} />)}</div>
        ) : (
          <EmptyState title={hasFilters ? "No stories match these filters" : "No stories yet"} icon={<Newspaper className="size-6" />}>
            {hasFilters ? "Try widening the date range or clearing filters." : "Stories appear once sources are checked (the worker does this automatically)."}
          </EmptyState>
        )}
      </Card>

      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between">
          <Button asChild variant="outline" size="sm" className={page <= 1 ? "pointer-events-none opacity-40" : ""}>
            <Link href={pageHref(page - 1)} aria-disabled={page <= 1}>
              Previous
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className={page >= pages ? "pointer-events-none opacity-40" : ""}>
            <Link href={pageHref(page + 1)} aria-disabled={page >= pages}>
              Next
            </Link>
          </Button>
        </nav>
      ) : null}

      <Card className="mt-8 p-5">
        <h2 className="text-[15px] font-semibold">Submit a link</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          For news from sources that aren&apos;t monitored automatically. Submitted links are marked <strong>unverified</strong>. Only the
          publisher&apos;s own metadata is read, and only where robots.txt allows.
        </p>
        <ActionForm action={submitLinkAction} resetOnSuccess className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Article URL" htmlFor="url" className="md:col-span-2">
            <Input id="url" name="url" type="url" required placeholder="https://…" />
          </Field>
          <Field label="Headline (optional)" htmlFor="title" hint="Required if the page can't be read automatically.">
            <Input id="title" name="title" maxLength={300} />
          </Field>
          <Field label="Short factual summary (optional)" htmlFor="description" hint="Don't paste article text. One or two sentences.">
            <Input id="description" name="description" maxLength={400} />
          </Field>
          <div className="md:col-span-2">
            <SubmitButton pendingText="Adding…">Add to News Feed</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
