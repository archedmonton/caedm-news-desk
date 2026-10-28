import { eq, sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HealthBadge, sourceHealth } from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { SourceForm } from "@/components/source-form";
import { Card } from "@/components/ui/primitives";
import { requirePageUser } from "@/lib/auth/session";
import { first, getDb } from "@/lib/db/client";
import { sources, stories, users } from "@/lib/db/schema";
import { getSettings } from "@/lib/settings";
import { ORG_TYPE_LABELS } from "@/lib/sources-admin";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Edit source" };

export default async function EditSourcePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageUser("manage_sources");
  const db = getDb();
  const id = Number((await params).id);
  const row = await first(
    db
      .select({ s: sources, verifier: users.name, verifierEmail: users.email })
      .from(sources)
      .leftJoin(users, eq(users.id, sources.verifiedBy))
      .where(eq(sources.id, id)),
  );
  if (!row || row.s.method === "manual" || row.s.slug === "sample") notFound();
  const { s } = row;
  const count = await first(
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(stories)
      .where(eq(stories.sourceId, id)),
  );
  const settings = await getSettings();

  return (
    <>
      <Link href="/sources" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Sources
      </Link>
      <PageHeader
        title={`Edit ${s.name}`}
        description={
          s.verified
            ? `Verified ${s.verifiedAt ? formatDateTime(s.verifiedAt) : ""}${row.verifier || row.verifierEmail ? ` by ${row.verifier || row.verifierEmail}` : s.origin === "registry" ? " (pilot verification)" : ""}.`
            : "Not verified yet. Add the organization's feed address and test it to start monitoring."
        }
        actions={<HealthBadge health={sourceHealth(s)} />}
      />
      <Card className="p-6">
        <SourceForm
          orgTypes={ORG_TYPE_LABELS}
          defaultInterval={settings.checkIntervalMinutes}
          initial={{
            id: s.id,
            name: s.name,
            websiteUrl: s.websiteUrl,
            feedUrl: s.feedUrl ?? "",
            orgType: s.orgType in ORG_TYPE_LABELS ? s.orgType : "catholic_partner",
            region: s.region,
            importance: s.importance,
            defaultCategory: s.defaultCategory,
            checkIntervalMinutes: s.checkIntervalMinutes,
            notes: s.notes ?? "",
            enabled: s.enabled,
            adapter: s.adapter,
            storyCount: count?.n ?? 0,
          }}
        />
      </Card>
    </>
  );
}
