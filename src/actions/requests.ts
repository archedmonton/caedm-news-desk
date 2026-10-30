"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/forms";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { updateOwnNotifications, updateOwnProfile } from "@/lib/auth/users";
import { ROLES } from "@/lib/db/schema";
import { approveAccessRequest, createAccessRequest, declineAccessRequest, setFeatureRequestStatus, submitFeatureRequest } from "@/lib/requests";
import { FEATURE_REQUEST_STATUSES } from "@/lib/db/schema";
import { BRIEF_TIMES } from "@/lib/notify/brief-schedule";

const BRIEF_TIME = z.enum(["default", ...BRIEF_TIMES] as [string, ...string[]]);

const id = z.coerce.number().int().positive();
const fail = (e: unknown): ActionState => ({ error: e instanceof z.ZodError ? "Please check the form fields." : (e as Error).message });

/** Public (unauthenticated): someone asks to join. */
export async function requestAccessAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    // Honeypot: real people never fill the hidden "website" field.
    if (String(fd.get("website") ?? "")) return { ok: true, message: "Thank you." };
    const role = z.enum(ROLES).catch("member").parse(fd.get("requestedRole"));
    const r = await createAccessRequest({
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      department: String(fd.get("department") ?? ""),
      requestedRole: role,
      reason: String(fd.get("reason") ?? ""),
    });
    revalidatePath("/", "layout");
    return { ok: true, message: r.message };
  } catch (e) {
    return fail(e);
  }
}

export async function approveAccessRequestAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("manage_staff");
    const role = z.enum(ROLES).parse(fd.get("role"));
    await approveAccessRequest(id.parse(fd.get("requestId")), role, { id: user.id, name: user.name || user.email });
    revalidatePath("/", "layout");
    return { ok: true, message: "Approved. An invitation was sent to their work email." };
  } catch (e) {
    return fail(e);
  }
}

export async function declineAccessRequestAction(fd: FormData) {
  const user = await requireUser("manage_staff");
  await declineAccessRequest(id.parse(fd.get("requestId")), user.id);
  revalidatePath("/", "layout");
}

export async function updateProfileAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("manage_own_account");
    await updateOwnProfile(user.id, String(fd.get("name") ?? ""));
    revalidatePath("/", "layout");
    return { ok: true, message: "Your profile was saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function updateNotificationsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("manage_own_account");
    const on = (k: string) => fd.get(k) === "on";
    await updateOwnNotifications(user.id, {
      notifyDigest: on("notifyDigest"),
      digestTime: ((t) => (t === "default" ? null : t))(BRIEF_TIME.parse(fd.get("digestTime") || "default")),
      digestDays: z.enum(["daily", "weekdays"]).catch("daily").parse(fd.get("digestDays")),
      digestScope: z.enum(["catholic", "all"]).catch("catholic").parse(fd.get("digestScope")),
      notifyAlerts: z.enum(["all", "p0", "none"]).parse(fd.get("notifyAlerts")),
      notifyAssignments: on("notifyAssignments"),
      // Only administrators receive access-request emails.
      notifyAccessRequests: can(user.role, "manage_staff") ? on("notifyAccessRequests") : false,
    });
    revalidatePath("/", "layout");
    return { ok: true, message: `Saved. Your emails go to ${user.email}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function submitFeatureRequestAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("request_feature");
    const r = await submitFeatureRequest({
      title: String(fd.get("title") ?? ""),
      description: String(fd.get("description") ?? ""),
      category: z.enum(["feature", "improvement", "bug", "source", "other"]).catch("feature").parse(fd.get("category")),
      importance: z.enum(["nice_to_have", "important", "urgent"]).catch("important").parse(fd.get("importance")),
      page: String(fd.get("page") ?? "") || null,
      user,
    });
    revalidatePath("/settings");
    revalidatePath("/outbox");
    return {
      ok: true,
      message:
        r.deliveryStatus === "sent"
          ? `Request #${r.id} was emailed to the developer (${r.developerEmail}). Thank you!`
          : `Request #${r.id} was saved and queued for ${r.developerEmail}. Email delivery is simulated until IT enables live email.`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function setFeatureRequestStatusAction(fd: FormData) {
  const user = await requireUser("manage_settings");
  await setFeatureRequestStatus(id.parse(fd.get("requestId")), z.enum(FEATURE_REQUEST_STATUSES).parse(fd.get("status")), user.id);
  revalidatePath("/settings");
}
