import { eq } from "drizzle-orm";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { first, getDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Delivery status of one email, polled by the page after a button queued it. Read-only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "not_found" }, { status: 404 });
  const n = await first(
    getDb()
      .select({ kind: notifications.kind, status: notifications.status, lastError: notifications.lastError, recipient: notifications.recipient })
      .from(notifications)
      .where(eq(notifications.id, id)),
  );
  // Same rule as the Email outbox: invitations and access requests are visible to administrators only.
  const allowed = n && (n.kind === "invite" || n.kind === "access_request" ? can(user.role, "manage_staff") : can(user.role, "read_news"));
  if (!allowed) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ status: n.status, lastError: n.lastError, recipient: n.recipient }, { headers: { "Cache-Control": "no-store" } });
}
