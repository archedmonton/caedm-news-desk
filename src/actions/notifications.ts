"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/forms";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { processAlerts } from "@/lib/notify/alerts";
import { requeueUnconfirmed } from "@/lib/notify/deliver";
import { sendBriefNow } from "@/lib/notify/digest";
import { dispatchNotification } from "@/lib/notify/dispatch";
import { parseOpId } from "@/lib/op-id";

const fail = (e: unknown): ActionState => ({ error: (e as Error).message });

/**
 * The brief is built and saved before replying; the email itself is sent after the response (see
 * dispatchNotification), and the page follows its delivery status.
 */
export async function sendBriefNowAction(_p: ActionState, fd?: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("manage_own_account");
    const opId = fd ? parseOpId(fd) : undefined;
    const r = await sendBriefNow(user.id, undefined, undefined, { opId, delivery: "after-response" });
    if (!r.duplicate) await audit("notification.brief_sent_now", "notification", r.notificationId, user.id, { storyCount: r.storyCount, op: opId });
    revalidatePath("/outbox");
    const stories = `${r.storyCount} ${r.storyCount === 1 ? "story" : "stories"}`;
    return { ok: true, message: `Your brief (${stories}) is on its way to ${r.recipient}.`, notificationId: r.notificationId };
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
  await dispatchNotification(nid, "after-response");
  await audit("notification.retried", "notification", nid, user.id);
  revalidatePath("/outbox");
}

/** For a message whose delivery was never confirmed: the person checked with the recipient and chose to resend. */
export async function resendUnconfirmedAction(fd: FormData) {
  const user = await requireUser("send_test_notifications");
  const nid = z.coerce.number().int().positive().parse(fd.get("notificationId"));
  await requeueUnconfirmed(nid);
  await dispatchNotification(nid, "after-response");
  await audit("notification.resent_unconfirmed", "notification", nid, user.id);
  revalidatePath("/outbox");
}
