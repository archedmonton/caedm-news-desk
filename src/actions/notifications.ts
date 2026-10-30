"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/forms";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { processAlerts } from "@/lib/notify/alerts";
import { deliverNotification } from "@/lib/notify/deliver";
import { createDigestPreviewNotification, sendBriefNow } from "@/lib/notify/digest";

const fail = (e: unknown): ActionState => ({ error: (e as Error).message });

export async function sendBriefNowAction(_p: ActionState): Promise<ActionState> {
  try {
    const user = await requireUser("manage_own_account");
    const r = await sendBriefNow(user.id);
    await audit("notification.brief_sent_now", "notification", r.notificationId, user.id, { storyCount: r.storyCount });
    revalidatePath("/outbox");
    const stories = `${r.storyCount} ${r.storyCount === 1 ? "story" : "stories"}`;
    if (r.status === "sent") return { ok: true, message: `Your brief (${stories}) was emailed to ${r.recipient}.` };
    if (r.status === "simulated") return { ok: true, message: `Your brief (${stories}) was saved to the outbox. Email delivery is simulated, so nothing was sent.` };
    return { error: `Your brief was saved but couldn't be emailed yet (${r.error ?? "delivery failed"}). It will be retried automatically.` };
  } catch (e) {
    return fail(e);
  }
}

export async function saveDigestPreviewAction(_p: ActionState): Promise<ActionState> {
  try {
    const user = await requireUser("send_test_notifications");
    const nid = await createDigestPreviewNotification(undefined, undefined, user.email);
    await audit("notification.digest_preview", "notification", nid, user.id);
    revalidatePath("/outbox");
    return { ok: true, message: "Preview saved to the outbox. It does not affect tomorrow's scheduled briefing." };
  } catch (e) {
    return fail(e);
  }
}

export async function runAlertsNowAction(_p: ActionState): Promise<ActionState> {
  try {
    const user = await requireUser("send_test_notifications");
    const r = await processAlerts();
    await audit("notification.alerts_run", "notification", null, user.id, { status: r.status });
    revalidatePath("/", "layout");
    if (r.status === "created") return { ok: true, message: `Alert created for ${r.storyIds.length} stories (see outbox).` };
    if (r.status === "rate_limited") return { ok: true, message: `Alert suppressed by flood control: ${r.reason}.` };
    if (r.status === "disabled") return { error: "Alerts are disabled in Settings." };
    return { ok: true, message: "No stories currently qualify for an alert." };
  } catch (e) {
    return fail(e);
  }
}

export async function retryNotificationAction(fd: FormData) {
  const user = await requireUser("send_test_notifications");
  const nid = z.coerce.number().int().positive().parse(fd.get("notificationId"));
  await deliverNotification(nid);
  await audit("notification.retried", "notification", nid, user.id);
  revalidatePath("/outbox");
}
