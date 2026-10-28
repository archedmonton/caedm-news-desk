import { UserPlus } from "lucide-react";
import { approveAccessRequestAction, declineAccessRequestAction } from "@/actions/requests";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardHeader, Select } from "@/components/ui/primitives";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { ROLES } from "@/lib/db/schema";
import type { listAccessRequests } from "@/lib/requests";
import { formatDateTime } from "@/lib/time";

type Rows = ReturnType<typeof listAccessRequests>;

/** Pending "request access" submissions, shown to administrators. Approval sends a normal invitation. */
export function AccessRequestsCard({ rows, title = "Access requests" }: { rows: Rows; title?: string }) {
  const pending = rows.filter(({ r }) => r.status === "pending");
  return (
    <Card className="border-gold-500/40" data-testid="access-requests">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <UserPlus className="size-4 text-gold-500" /> {title}
          </span>
        }
        description={pending.length ? `${pending.length} waiting for an administrator` : "No pending requests"}
      />
      <ul className="divide-y divide-line">
        {rows.map(({ r, reviewer, reviewerEmail }) => (
          <li key={r.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start md:justify-between" data-testid="access-request">
            <div className="min-w-0 text-sm">
              <div className="font-semibold text-ink">{r.name}</div>
              <div className="text-muted">{r.email}</div>
              <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 text-xs text-muted sm:grid-cols-2">
                <div>
                  <dt className="inline text-subtle">Department: </dt>
                  <dd className="inline">{r.department || "—"}</dd>
                </div>
                <div>
                  <dt className="inline text-subtle">Requested: </dt>
                  <dd className="inline">{ROLE_LABELS[r.requestedRole]}</dd>
                </div>
                <div>
                  <dt className="inline text-subtle">Received: </dt>
                  <dd className="inline">{formatDateTime(r.createdAt)}</dd>
                </div>
              </dl>
              {r.reason ? <p className="mt-2 whitespace-pre-wrap rounded-md bg-paper px-3 py-2 text-sm text-ink">{r.reason}</p> : null}
            </div>
            {r.status === "pending" ? (
              <div className="flex shrink-0 flex-col gap-2 md:w-56">
                <ActionForm action={approveAccessRequestAction} className="flex gap-2">
                  <input type="hidden" name="requestId" value={r.id} />
                  <label htmlFor={`ar-role-${r.id}`} className="sr-only">
                    Role for {r.email}
                  </label>
                  <Select id={`ar-role-${r.id}`} name="role" defaultValue={r.requestedRole} className="h-8 text-xs">
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </Select>
                  <SubmitButton size="sm" pendingText="…">
                    Approve
                  </SubmitButton>
                </ActionForm>
                <form action={declineAccessRequestAction}>
                  <input type="hidden" name="requestId" value={r.id} />
                  <SubmitButton variant="ghost" size="xs" className="w-full">
                    Decline
                  </SubmitButton>
                </form>
              </div>
            ) : (
              <div className="shrink-0 text-xs text-muted">
                <span className="font-medium capitalize text-ink">{r.status}</span>
                {r.grantedRole ? ` as ${ROLE_LABELS[r.grantedRole]}` : ""} by {reviewer || reviewerEmail || "—"}
                <br />
                {formatDateTime(r.reviewedAt)}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
