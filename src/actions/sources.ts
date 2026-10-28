"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/forms";
import { requireUser } from "@/lib/auth/session";
import { first, getDb } from "@/lib/db/client";
import { sources } from "@/lib/db/schema";
import { createSource, deleteSource, discoverFeeds, sourceInputSchema, testSourceFeed, updateSource, type FeedTestResult } from "@/lib/sources-admin";

const url = z.string().trim().url();

export async function discoverFeedsAction(websiteUrl: string): Promise<{ feeds: { url: string; title: string }[] } | { error: string }> {
  await requireUser("manage_sources");
  const parsed = url.safeParse(websiteUrl);
  if (!parsed.success) return { error: "Enter the organization's website address first." };
  try {
    const feeds = await discoverFeeds(parsed.data);
    return feeds.length
      ? { feeds }
      : { error: "That website doesn't advertise an RSS or Atom feed. Look for an RSS link on its news page, or ask the developer." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function testFeedAction(feedUrl: string, sourceId?: number): Promise<FeedTestResult> {
  await requireUser("manage_sources");
  const parsed = url.safeParse(feedUrl);
  if (!parsed.success) return { ok: false, error: "Enter a valid feed address." };
  let adapter = "rss";
  if (sourceId) {
    const s = await first(getDb().select({ adapter: sources.adapter }).from(sources).where(eq(sources.id, sourceId)));
    if (s && s.adapter !== "none") adapter = s.adapter;
  }
  return testSourceFeed(parsed.data, adapter);
}

export async function saveSourceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let target: string;
  try {
    const user = await requireUser("manage_sources");
    const input = sourceInputSchema.parse({
      name: fd.get("name"),
      websiteUrl: fd.get("websiteUrl"),
      feedUrl: fd.get("feedUrl"),
      orgType: fd.get("orgType"),
      region: fd.get("region"),
      importance: fd.get("importance"),
      defaultCategory: fd.get("defaultCategory"),
      checkIntervalMinutes: fd.get("checkIntervalMinutes") ?? "",
      notes: fd.get("notes") ?? "",
      enabled: fd.get("enabled") === "on",
    });
    const id = Number(fd.get("sourceId")) || 0;
    if (id) await updateSource(id, input, user.id);
    else await createSource(input, user.id);
    revalidatePath("/", "layout");
    target = "/sources?saved=1";
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues.map((i) => i.message).join(" ") };
    return { error: (e as Error).message };
  }
  redirect(target);
}

export async function deleteSourceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("manage_sources");
    await deleteSource(Number(fd.get("sourceId")), user.id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/", "layout");
  redirect("/sources?deleted=1");
}
