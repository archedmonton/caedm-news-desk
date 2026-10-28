"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/forms";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { PRIORITIES, REVIEW_STATUSES } from "@/lib/db/schema";
import { submitManualLink } from "@/lib/ingest/collector";
import { FetchError } from "@/lib/ingest/safe-fetch";
import { edmontonDayRange, zonedTimeToUtc } from "@/lib/time";
import { addFollowUpNote, assignFollowUp, markVerified, overridePriority, resetPriority, setReviewStatus } from "@/lib/workflow";

const id = z.coerce.number().int().positive();

function refresh(storyId?: number) {
  revalidatePath("/", "layout");
  if (storyId) revalidatePath(`/news/${storyId}`);
}

const fail = (e: unknown): ActionState => ({ error: (e as Error).message || "Something went wrong." });

/** Quick status change used by buttons (no inline result). */
export async function setStatusAction(fd: FormData) {
  const user = await requireUser("review_news");
  const storyId = id.parse(fd.get("storyId"));
  setReviewStatus(storyId, z.enum(REVIEW_STATUSES).parse(fd.get("status")), user.id);
  refresh(storyId);
}

export async function setStatusWithResultAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await setStatusAction(fd);
    return { ok: true, message: "Status updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function overridePriorityAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("change_priority");
    const storyId = id.parse(fd.get("storyId"));
    const priority = z.enum(PRIORITIES).parse(fd.get("priority"));
    overridePriority(storyId, priority, String(fd.get("reason") ?? ""), user.id);
    refresh(storyId);
    return {
      ok: true,
      message:
        priority === "P0" || priority === "P1"
          ? `Priority set to ${priority}. If not already alerted, it will be included in the next alert check.`
          : `Priority set to ${priority}.`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function resetPriorityAction(fd: FormData) {
  const user = await requireUser("change_priority");
  const storyId = id.parse(fd.get("storyId"));
  resetPriority(storyId, user.id);
  refresh(storyId);
}

export async function markVerifiedAction(fd: FormData) {
  const user = await requireUser("review_news");
  const storyId = id.parse(fd.get("storyId"));
  markVerified(storyId, user.id);
  refresh(storyId);
}

/** "YYYY-MM-DD" (+ optional "HH:MM") interpreted as Edmonton local time. */
function parseDue(date: string, time: string): number | null {
  if (!date) return null;
  const range = edmontonDayRange(date);
  if (!range) throw new Error("Invalid due date.");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "17:00").split(":").map(Number);
  return zonedTimeToUtc(y, m, d, hh || 0, mm || 0);
}

export async function assignFollowUpAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("manage_follow_ups");
    const storyId = id.parse(fd.get("storyId"));
    const assigneeRaw = String(fd.get("assigneeId") ?? "");
    const dueAt = parseDue(String(fd.get("dueDate") ?? ""), String(fd.get("dueTime") ?? ""));
    assignFollowUp(storyId, { assigneeId: assigneeRaw ? id.parse(assigneeRaw) : null, dueAt, note: String(fd.get("note") ?? "") }, user.id);
    refresh(storyId);
    return { ok: true, message: "Follow-up assigned." };
  } catch (e) {
    return fail(e);
  }
}

export async function addNoteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("manage_follow_ups");
    const storyId = id.parse(fd.get("storyId"));
    addFollowUpNote(storyId, String(fd.get("body") ?? ""), user.id);
    refresh(storyId);
    return { ok: true, message: "Note added." };
  } catch (e) {
    return fail(e);
  }
}

export async function submitLinkAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("submit_links");
    const url = z.string().url().max(2000).parse(String(fd.get("url") ?? "").trim());
    const res = await submitManualLink({ url, title: String(fd.get("title") ?? ""), description: String(fd.get("description") ?? "") });
    audit("story.manual_submitted", "story", res.storyId, user.id, { url, duplicate: res.duplicate });
    refresh(res.storyId ?? undefined);
    if (res.duplicate) return { ok: true, message: "That link is already in the News Feed." };
    return { ok: true, message: `Link added as an unverified story.${res.note ? ` ${res.note}` : ""}` };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: "Enter a valid http(s) URL." };
    if (e instanceof FetchError && e.code === "blocked_url") return { error: `That URL can't be fetched: ${e.message}` };
    return fail(e);
  }
}
