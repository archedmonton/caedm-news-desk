import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SourceForm } from "@/components/source-form";
import { Card } from "@/components/ui/primitives";
import { requirePageUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { ORG_TYPE_LABELS } from "@/lib/sources-admin";

export const metadata: Metadata = { title: "Add source" };

export default async function NewSourcePage() {
  await requirePageUser("manage_sources");
  const s = await getSettings();
  return (
    <>
      <Link href="/sources" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Sources
      </Link>
      <PageHeader
        title="Add a news source"
        description="Add any organization that publishes an RSS or Atom news feed. News Desk tests the feed before saving."
      />
      <Card className="p-6">
        <SourceForm
          orgTypes={ORG_TYPE_LABELS}
          defaultInterval={s.checkIntervalMinutes}
          initial={{
            name: "",
            websiteUrl: "",
            feedUrl: "",
            orgType: "catholic_partner",
            region: "edmonton",
            importance: 3,
            defaultCategory: "community",
            checkIntervalMinutes: null,
            notes: "",
            enabled: true,
          }}
        />
      </Card>
    </>
  );
}
