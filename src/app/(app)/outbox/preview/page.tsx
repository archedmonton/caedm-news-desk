import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmailFrame } from "@/components/email-frame";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { buildDigest } from "@/lib/notify/digest";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Brief preview" };

export default async function DigestPreviewPage() {
  await requireUser();
  const d = await buildDigest();
  const s = await getSettings();
  return (
    <>
      <Link href="/outbox" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Outbox
      </Link>
      <PageHeader
        title="Morning brief preview"
        description={`Live preview of what would be sent to ${s.digestRecipient} if the brief ran now: ${d.storyIds.length} stories, ${d.followUps.length} follow-ups. Nothing is sent or recorded.`}
      />
      <p className="mb-3 text-sm text-ink" data-testid="digest-subject">
        Subject: <strong>{d.subject}</strong>
      </p>
      <EmailFrame html={d.html} title={d.subject} />
    </>
  );
}
