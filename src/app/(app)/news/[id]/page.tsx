import { AlertTriangle, ArrowLeft, BadgeCheck, ExternalLink, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addNoteAction, assignFollowUpAction, markVerifiedAction, overridePriorityAction, resetPriorityAction, setStatusWithResultAction } from "@/actions/stories";
import { CategoryBadge, PriorityBadge, SampleBadge, StatusBadge, VerificationBadge } from "@/components/badges";
import { ActionForm, SubmitButton } from "@/components/forms";
import { StoryRow } from "@/components/story-row";
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/session";
import { getStoryDetail, listActiveStaff } from "@/lib/queries";
import { edmontonDateKey, formatDateTime, zonedParts } from "@/lib/time";
import { CATEGORY_LABELS, GEO_LABELS, STATUS_LABELS, VERIFICATION_LABELS } from "@/lib/utils";
import { TRANSITIONS } from "@/lib/workflow";

export const metadata: Metadata = { title: "Story" };

const DESCRIPTION_SOURCE: Record<string, string> = {
  feed: "Publisher's feed description",
  listing: "Publisher's newsroom summary",
  page_meta: "Publisher's page description",
  staff: "Summary entered by staff",
  none: "No publisher description available",
};

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const d = getStoryDetail(Number(id));
  if (!d) notFound();
  const s = d.s;
  const staff = listActiveStaff();
  const fu = d.followUp?.f;
  const due = fu?.dueAt ? zonedParts(fu.dueAt) : null;
  const nextStatuses = TRANSITIONS[s.reviewStatus].filter((x) => x !== "assigned");

  return (
    <>
      <Link href="/news" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> News Feed
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <div className="flex flex-wrap items-center gap-1.5">
              <PriorityBadge priority={s.priority} overridden={s.priorityOverridden} />
              <StatusBadge status={s.reviewStatus} />
              <CategoryBadge category={s.category} />
              <VerificationBadge status={s.verificationStatus} sensitive={s.sensitive} />
              {s.isSample ? <SampleBadge /> : null}
            </div>
            <h1 className="mt-3 font-serif text-2xl font-semibold leading-tight text-ink">{s.title}</h1>
            {s.sensitive || s.verificationStatus === "unverified" ? (
              <div role="note" className="mt-4 flex gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>
                  {s.sensitive ? "This story involves a sensitive subject. " : ""}
                  {s.verificationStatus === "unverified" ? "It did not come from the organization's own official channel. " : ""}
                  Treat claims as reported by <strong>{d.sourceName}</strong>, not as established fact, and verify before any external use.
                </p>
              </div>
            ) : null}
            {s.description ? (
              <blockquote className="mt-4 border-l-2 border-gold-500 pl-4 text-[15px] leading-relaxed text-ink">
                {s.description}
                <footer className="mt-1 text-xs text-subtle">
                  {DESCRIPTION_SOURCE[s.descriptionSource]} · {d.sourceName}
                </footer>
              </blockquote>
            ) : (
              <p className="mt-4 text-sm text-muted">No publisher description is available. Open the original source to read the story.</p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild>
                <a href={s.canonicalUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Open original source
                </a>
              </Button>
              {s.verificationStatus === "unverified" ? (
                <form action={markVerifiedAction}>
                  <input type="hidden" name="storyId" value={s.id} />
                  <SubmitButton variant="outline">
                    <BadgeCheck /> Mark verified by staff
                  </SubmitButton>
                </form>
              ) : null}
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-3">
              <Meta label="Publisher">{d.sourceName}</Meta>
              <Meta label="Published">{s.publishedAt ? formatDateTime(s.publishedAt) : "Not provided by source"}</Meta>
              <Meta label="First detected">{formatDateTime(s.firstDetectedAt)}</Meta>
              <Meta label="Source updated">{s.sourceUpdatedAt ? formatDateTime(s.sourceUpdatedAt) : "—"}</Meta>
              <Meta label="Category">{CATEGORY_LABELS[s.category]}</Meta>
              <Meta label="Geographic relevance">{GEO_LABELS[s.geoRelevance]}</Meta>
              <Meta label="Verification">{VERIFICATION_LABELS[s.verificationStatus]}</Meta>
              <Meta label="Review status">{STATUS_LABELS[s.reviewStatus]}</Meta>
              <Meta label="URL">
                <span className="break-all text-xs text-muted">{s.canonicalUrl}</span>
              </Meta>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Why this priority" description={`Score ${s.priorityScore}${s.priorityOverridden ? " · manually overridden" : ""}`} />
            <ul className="list-disc space-y-1 px-9 py-4 text-sm text-ink marker:text-subtle">
              {s.priorityReason.split("; ").map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </Card>

          <Card id="follow-up">
            <CardHeader
              title="Follow-up"
              description={fu ? `Assigned to ${d.followUp?.assignee || d.followUp?.assigneeEmail || "nobody"}${fu.dueAt ? ` · due ${formatDateTime(fu.dueAt)}` : ""}` : "Not assigned"}
            />
            <div className="space-y-6 px-5 py-4">
              <ActionForm action={assignFollowUpAction} className="grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="storyId" value={s.id} />
                <Field label="Assignee" htmlFor="assigneeId">
                  <Select id="assigneeId" name="assigneeId" defaultValue={fu?.assigneeId ?? ""}>
                    <option value="">Unassigned</option>
                    {staff.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Due date" htmlFor="dueDate">
                  <Input id="dueDate" name="dueDate" type="date" defaultValue={fu?.dueAt ? edmontonDateKey(fu.dueAt) : ""} />
                </Field>
                <Field label="Due time" htmlFor="dueTime" hint="Edmonton time">
                  <Input id="dueTime" name="dueTime" type="time" defaultValue={due ? `${String(due.hour).padStart(2, "0")}:${String(due.minute).padStart(2, "0")}` : "17:00"} />
                </Field>
                <Field label="Note (optional)" htmlFor="assign-note" className="sm:col-span-3">
                  <Input id="assign-note" name="note" maxLength={4000} placeholder="What needs to happen?" />
                </Field>
                <div className="sm:col-span-3">
                  <SubmitButton pendingText="Saving…">{fu ? "Update follow-up" : "Assign follow-up"}</SubmitButton>
                </div>
              </ActionForm>

              <div>
                <h3 className="text-sm font-semibold">Internal notes</h3>
                <ActionForm action={addNoteAction} resetOnSuccess className="mt-2 space-y-2">
                  <input type="hidden" name="storyId" value={s.id} />
                  <label htmlFor="note-body" className="sr-only">
                    New note
                  </label>
                  <Textarea id="note-body" name="body" required maxLength={4000} placeholder="Add an internal note (not shared outside News Desk)" />
                  <SubmitButton size="sm" variant="outline" pendingText="Adding…">
                    Add note
                  </SubmitButton>
                </ActionForm>
                <ul className="mt-4 space-y-3">
                  {d.notes.length === 0 ? <li className="text-sm text-muted">No notes yet.</li> : null}
                  {d.notes.map(({ n, author, authorEmail }) => (
                    <li key={n.id} className="rounded-lg bg-paper px-4 py-3">
                      <p className="whitespace-pre-wrap text-sm text-ink">{n.body}</p>
                      <p className="mt-1 text-xs text-subtle">
                        {author || authorEmail || "System"} · {formatDateTime(n.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          {d.related.length ? (
            <Card>
              <CardHeader title="Related stories" description="Grouped by similar headlines" />
              <div className="divide-y divide-line">{d.related.map((r) => <StoryRow key={r.id} s={r} actions={false} />)}</div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Workflow" description="New → Reviewing → Assigned → Covered / Archived" />
            <div className="space-y-2 px-5 py-4">
              <ActionForm action={setStatusWithResultAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="storyId" value={s.id} />
                {nextStatuses.map((st) => (
                  <SubmitButton key={st} name="status" value={st} variant={st === "covered" ? "default" : "outline"} size="sm">
                    {st === "reviewing" ? (s.reviewStatus === "new" ? "Mark reviewed" : "Reopen") : st === "new" ? "Restore to New" : st === "covered" ? "Mark covered" : "Archive"}
                  </SubmitButton>
                ))}
              </ActionForm>
              <p className="text-xs text-muted">To assign, use the Follow-up panel.</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Change priority" />
            <div className="px-5 py-4">
              <ActionForm action={overridePriorityAction} className="space-y-3">
                <input type="hidden" name="storyId" value={s.id} />
                <Field label="Priority" htmlFor="priority">
                  <Select id="priority" name="priority" defaultValue={s.priority}>
                    <option value="P0">P0 Critical</option>
                    <option value="P1">P1 High</option>
                    <option value="P2">P2 Standard</option>
                    <option value="P3">P3 Background</option>
                  </Select>
                </Field>
                <Field label="Reason" htmlFor="reason">
                  <Input id="reason" name="reason" required maxLength={300} placeholder="Why the change?" />
                </Field>
                <SubmitButton size="sm" pendingText="Saving…">
                  Save priority
                </SubmitButton>
              </ActionForm>
              {s.priorityOverridden ? (
                <form action={resetPriorityAction} className="mt-3">
                  <input type="hidden" name="storyId" value={s.id} />
                  <SubmitButton variant="ghost" size="sm">
                    <RotateCcw /> Restore automatic priority
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="History" />
            <ol className="space-y-3 px-5 py-4 text-sm">
              {d.history.map(({ h, by, byEmail }) => (
                <li key={`p${h.id}`}>
                  <div className="text-ink">
                    {h.fromPriority ? `${h.fromPriority} → ` : ""}
                    <strong>{h.toPriority}</strong> <span className="text-muted">by {h.changedBy ? by || byEmail : "classifier"}</span>
                  </div>
                  <div className="line-clamp-2 text-xs text-subtle" title={h.reason}>
                    {formatDateTime(h.changedAt)} · {h.reason}
                  </div>
                </li>
              ))}
              {d.activity
                .filter(({ a }) => a.action !== "story.priority_overridden" && a.action !== "story.priority_reset")
                .map(({ a, by, byEmail }) => (
                  <li key={`a${a.id}`}>
                    <div className="text-ink">
                      {a.action.replace("story.", "").replace("follow_up.", "follow-up ").replace(/_/g, " ")}
                      {a.details && "to" in a.details ? ` → ${STATUS_LABELS[String(a.details.to)] ?? String(a.details.to)}` : ""}
                      <span className="text-muted"> by {by || byEmail || "system"}</span>
                    </div>
                    <div className="text-xs text-subtle">{formatDateTime(a.createdAt)}</div>
                  </li>
                ))}
            </ol>
          </Card>

          <Card>
            <CardHeader title="Sources & notifications" />
            <div className="space-y-3 px-5 py-4 text-sm">
              {d.reportedBy.map((r) => (
                <div key={r.name}>
                  <div className="text-ink">{r.name}</div>
                  <div className="text-xs text-subtle">Detected {formatDateTime(r.detectedAt)}</div>
                </div>
              ))}
              {d.sentIn.length ? (
                d.sentIn.map((n) => (
                  <Link key={n.id} href={`/outbox/${n.id}`} className="block text-navy-700 hover:underline">
                    {n.kind === "digest" ? "Included in brief" : "Alert"}: {formatDateTime(n.createdAt)} ({n.status})
                  </Link>
                ))
              ) : (
                <p className="text-xs text-muted">Not yet included in any email.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
