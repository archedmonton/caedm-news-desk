import type { Metadata } from "next";
import guide from "../../../../docs/USER-GUIDE.md";
import { HelpTrigger } from "@/components/help";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/primitives";
import { requirePageUser } from "@/lib/auth/session";
import { Markdown, parseHeadings } from "@/lib/markdown";

export const metadata: Metadata = { title: "User guide" };

export default async function GuidePage() {
  await requirePageUser("read_news");
  // The file's own title and intro are replaced by the page header.
  const body = guide.slice(guide.search(/^## /m));
  const contents = parseHeadings(body).filter((h) => h.level === 2);

  return (
    <>
      <PageHeader
        title="User guide"
        description="What News Desk does, how it decides what matters, and how to use each page."
        actions={<HelpTrigger />}
      />
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Guide contents" className="self-start text-sm lg:sticky lg:top-6">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Contents</div>
          <ol className="space-y-1 border-l border-line">
            {contents.map((h) => (
              <li key={h.id}>
                <a href={`#${h.id}`} className="-ml-px block border-l border-transparent py-0.5 pl-3 text-muted hover:border-gold-500 hover:text-maroon-800">
                  {h.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <Card className="min-w-0">
          <article className="guide px-5 py-6 sm:px-8">
            <Markdown source={body} />
          </article>
        </Card>
      </div>
    </>
  );
}
