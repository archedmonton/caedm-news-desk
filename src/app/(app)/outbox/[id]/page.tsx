import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmailFrame } from "@/components/email-frame";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/primitives";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { getNotification } from "@/lib/queries";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Email" };

export default async function NotificationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const n = getNotification(Number((await params).id));
  if (!n) notFound();
  // Invitation and access-request emails contain sign-up links or personal details: administrators only.
  if ((n.kind === "invite" || n.kind === "access_request") && !can(user.role, "manage_staff")) notFound();

  return (
    <>
      <Link href="/outbox" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Outbox
      </Link>
      <PageHeader title={n.subject} description={`To ${n.recipient} · ${formatDateTime(n.createdAt)}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {n.html ? (
            <EmailFrame html={n.html} title={n.subject} />
          ) : (
            <Card className="p-6 text-sm text-muted">No message body was generated{n.lastError ? `: ${n.lastError}` : "."}</Card>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Delivery" />
            <dl className="space-y-2 px-5 py-4 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Status</dt>
                <dd className="font-medium capitalize">{n.status}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Transport</dt>
                <dd>{n.transport}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Attempts</dt>
                <dd>{n.attempts}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Delivered / simulated</dt>
                <dd>{formatDateTime(n.sentAt)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Dedupe key</dt>
                <dd className="truncate font-mono text-xs" title={n.dedupeKey}>
                  {n.dedupeKey}
                </dd>
              </div>
              {n.lastError ? <p className="rounded-md bg-p0-soft px-3 py-2 text-p0">{n.lastError}</p> : null}
            </dl>
          </Card>
          {n.linked.length ? (
            <Card>
              <CardHeader title={`Stories (${n.linked.length})`} />
              <ul className="space-y-1.5 px-5 py-4 text-sm">
                {n.linked.map((s) => (
                  <li key={s.id}>
                    <Link href={`/news/${s.id}`} className="hover:underline">
                      [{s.priority}] {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card>
              <CardHeader title="Plain-text version" />
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap px-5 py-4 font-sans text-xs text-muted">{n.text}</pre>
            </Card>
        </div>
      </div>
    </>
  );
}
