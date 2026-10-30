import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmailFrame } from "@/components/email-frame";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { first, getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { briefScheduleLabel } from "@/lib/notify/brief-schedule";
import { buildDigest } from "@/lib/notify/digest";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Brief preview" };

export default async function DigestPreviewPage() {
  const session = await requireUser();
  const db = getDb();
  const me = (await first(db.select().from(users).where(eq(users.id, session.id))))!;
  const s = await getSettings();
  const now = Date.now();
  const d = await buildDigest(db, now, {
    personal: { user: me, scope: me.digestScope, scheduleLabel: me.notifyDigest ? briefScheduleLabel(me, s.digestTime) : "Preview" },
    windowStart: now - s.digestLookbackHours * 3600_000,
  });
  return (
    <>
      <Link href="/outbox" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Outbox
      </Link>
      <PageHeader
        title="My brief preview"
        description={`What your brief to ${me.email} would contain right now (last ${s.digestLookbackHours} hours, ${me.digestScope === "catholic" ? "Catholic news only" : "all monitored news"}): ${d.storyIds.length} stories, ${d.followUps.length} of your follow-ups. Nothing is sent or recorded.`}
      />
      <p className="mb-3 text-sm text-ink" data-testid="digest-subject">
        Subject: <strong>{d.subject}</strong>
      </p>
      <EmailFrame html={d.html} title={d.subject} />
    </>
  );
}
