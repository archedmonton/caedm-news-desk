import type { Metadata } from "next";
import { deleteStaffAction, inviteStaffAction, setStaffRoleAction, setStaffStatusAction } from "@/actions/admin";
import { AccessRequestsCard } from "@/components/access-requests";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { HelpTrigger } from "@/components/help";
import { PageHeader } from "@/components/page-header";
import { Badge, Card, CardHeader, Field, Input, Select } from "@/components/ui/primitives";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { ROLES } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { listStaff } from "@/lib/queries";
import { listAccessRequests } from "@/lib/requests";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Team management" };

export default async function TeamPage() {
  const user = await requireUser("manage_staff");
  const [staff, requests] = await Promise.all([listStaff(), listAccessRequests("all")]);

  return (
    <>
      <PageHeader
        title="Team management"
        description="Invite people, set their roles, and approve or decline access requests. Every change is audit-logged."
        actions={<HelpTrigger />}
      />
      <div className="space-y-6">
        {requests.length ? <AccessRequestsCard rows={requests} title="Access requests" /> : null}
        <Card>
          <CardHeader
            title="Staff"
            description={`Invitation only: administrators add people. Only @${env().ALLOWED_EMAIL_DOMAIN} work emails can be invited. Administrators can promote anyone, including to Administrator, but can't change or delete their own account here.`}
          />
          <dl className="grid gap-x-6 gap-y-2 border-b border-line px-5 py-4 text-xs sm:grid-cols-3">
            {ROLES.map((r) => (
              <div key={r}>
                <dt className="font-semibold text-ink">{ROLE_LABELS[r]}</dt>
                <dd className="text-muted">{ROLE_DESCRIPTIONS[r]}</dd>
              </div>
            ))}
          </dl>
          <ActionForm
            action={inviteStaffAction}
            resetOnSuccess
            className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-end"
          >
            <Field label="Full name" htmlFor="invite-name" className="flex-1">
              <Input id="invite-name" name="name" required maxLength={100} placeholder="e.g. Maria Santos" autoComplete="off" />
            </Field>
            <Field label="Work email" htmlFor="invite-email" className="flex-1">
              <Input id="invite-email" name="email" type="email" required placeholder={`name@${env().ALLOWED_EMAIL_DOMAIN}`} autoComplete="off" />
            </Field>
            <Field label="Role" htmlFor="invite-role">
              <Select id="invite-role" name="role" defaultValue="member">
                {[...ROLES].reverse().map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton pendingText="Inviting…">Send invitation</SubmitButton>
          </ActionForm>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs text-subtle">
                <tr>
                  <th className="px-5 py-2 font-medium">Person</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Last sign-in</th>
                  <th className="px-5 py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {staff.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-2.5">
                      <div className="font-medium text-ink">
                        {u.name || "—"}
                        {u.id === user.id ? <span className="ml-1 text-xs font-normal text-muted">(you)</span> : null}
                        {u.isDeveloper ? <Badge className="ml-2 border-gold-300 bg-gold-100 text-gold-800">Developer</Badge> : null}
                      </div>
                      <div className="text-xs text-muted">{u.email}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <form action={setStaffRoleAction} className="flex items-center gap-1">
                        <input type="hidden" name="userId" value={u.id} />
                        <Select
                          name="role"
                          defaultValue={u.role}
                          aria-label={`Role for ${u.email}`}
                          className="h-8 w-40 text-xs"
                          disabled={u.id === user.id || u.isDeveloper}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </Select>
                        {u.id !== user.id && !u.isDeveloper ? (
                          <SubmitButton variant="ghost" size="xs">
                            Save
                          </SubmitButton>
                        ) : null}
                      </form>
                    </td>
                    <td className="px-3 py-2.5 capitalize">{u.status}</td>
                    <td className="px-3 py-2.5 text-muted">{formatDateTime(u.lastLoginAt)}</td>
                    <td className="px-5 py-2.5 text-right">
                      {u.id !== user.id && !u.isDeveloper ? (
                        <div className="flex items-center justify-end gap-1">
                          {u.status !== "invited" ? (
                            <form action={setStaffStatusAction}>
                              <input type="hidden" name="userId" value={u.id} />
                              <input type="hidden" name="status" value={u.status === "disabled" ? "active" : "disabled"} />
                              <SubmitButton variant="ghost" size="xs">
                                {u.status === "disabled" ? "Re-enable" : "Disable"}
                              </SubmitButton>
                            </form>
                          ) : null}
                          <form action={deleteStaffAction} aria-label={`Delete ${u.email}`}>
                            <input type="hidden" name="userId" value={u.id} />
                            <ConfirmSubmit
                              label={u.status === "invited" ? "Cancel invite" : "Delete"}
                              confirmLabel={u.status === "invited" ? "Confirm cancel" : "Confirm delete"}
                              pendingText="Deleting…"
                            />
                          </form>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-5 py-3 text-xs text-muted">
            <strong className="text-ink">Disable</strong> pauses someone&apos;s access and can be undone. <strong className="text-ink">Delete</strong>{" "}
            removes the account permanently: their follow-ups become unassigned, their notes and history are kept, and the address can be invited
            again later.
          </p>
        </Card>
      </div>
    </>
  );
}
