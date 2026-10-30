"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/forms";
import { audit } from "@/lib/audit";
import { productionAccess } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/session";
import { createInvitation, deleteUser, setUserRole, setUserStatus } from "@/lib/auth/users";
import { first, getDb } from "@/lib/db/client";
import { ROLES, sources } from "@/lib/db/schema";
import { checkSource, reclassifyAll } from "@/lib/ingest/collector";
import { RULE_LIST_KEYS, type PriorityRules } from "@/lib/priority/rules";
import { getSettings, setSettings, settingsSchema } from "@/lib/settings";

const id = z.coerce.number().int().positive();
const fail = (e: unknown): ActionState => ({
  error: e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (e as Error).message,
});

// ---------- Sources ----------

export async function toggleSourceAction(fd: FormData) {
  const user = await requireUser("manage_sources");
  const sourceId = id.parse(fd.get("sourceId"));
  const enable = fd.get("enabled") === "true";
  const db = getDb();
  const src = await first(db.select().from(sources).where(eq(sources.id, sourceId)));
  if (!src) throw new Error("Source not found");
  if (enable && !src.verified) throw new Error("Unverified sources cannot be enabled.");
  await db
    .update(sources)
    .set({ enabled: enable, nextCheckAt: enable ? Date.now() : src.nextCheckAt, updatedAt: Date.now() })
    .where(eq(sources.id, sourceId));
  await audit(enable ? "source.enabled" : "source.disabled", "source", sourceId, user.id, { slug: src.slug });
  revalidatePath("/", "layout");
}

export async function checkSourceNowAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("check_sources");
    const sourceId = id.parse(fd.get("sourceId"));
    const r = await checkSource(sourceId, { trigger: "manual" });
    await audit("source.checked_manually", "source", sourceId, user.id, { status: r.status, itemsNew: r.itemsNew });
    revalidatePath("/", "layout");
    return r.status === "success"
      ? {
          ok: true,
          message: `Checked: ${r.itemsFound} items found, ${r.itemsNew} new.${r.warnings.length ? ` ${r.warnings.length} warning(s).` : ""}`,
        }
      : { error: `Check failed: ${r.error}` };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Settings ----------

const bool = (v: FormDataEntryValue | null) => v === "on" || v === "true";

export async function saveSettingsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("manage_settings");
    const current = await getSettings();
    const section = String(fd.get("section"));
    const raw: Record<string, unknown> = { ...current };
    for (const [k, v] of fd.entries()) if (!k.startsWith("$") && k !== "section") raw[k] = v;
    if (section === "digest") raw.digestEnabled = bool(fd.get("digestEnabled"));
    if (section === "alerts") {
      raw.alertsEnabled = bool(fd.get("alertsEnabled"));
      raw.alertP0BypassWindow = bool(fd.get("alertP0BypassWindow"));
    }
    const parsed = settingsSchema.parse(raw);
    await setSettings(parsed, user.id);
    await audit("settings.updated", "settings", section, user.id, Object.fromEntries(Object.entries(parsed).filter(([k]) => fd.has(k))));
    revalidatePath("/", "layout");
    return { ok: true, message: "Settings saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function savePriorityRulesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("manage_settings");
    const rules: PriorityRules = { ...(await getSettings()).priorityRules };
    for (const key of RULE_LIST_KEYS) {
      const v = fd.get(key);
      if (typeof v === "string") {
        rules[key] = v
          .split(/[\n,]/)
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 200);
      }
    }
    const nums = z
      .object({
        highThreshold: z.coerce.number().int().min(10).max(200),
        standardThreshold: z.coerce.number().int().min(0).max(200),
        criticalWindowHours: z.coerce.number().int().min(1).max(336),
      })
      .parse({
        highThreshold: fd.get("highThreshold"),
        standardThreshold: fd.get("standardThreshold"),
        criticalWindowHours: fd.get("criticalWindowHours"),
      });
    if (nums.standardThreshold >= nums.highThreshold) throw new Error("Standard threshold must be lower than the high threshold.");
    Object.assign(rules, nums);
    await setSettings({ priorityRules: rules }, user.id);
    const r = fd.get("reclassify") === "on" ? await reclassifyAll() : null;
    await audit("settings.priority_rules_updated", "settings", "priorityRules", user.id, { ...nums, reclassified: r });
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: r ? `Rules saved. Re-classified ${r.total} stories (${r.changed} changed priority).` : "Rules saved. New stories will use them.",
    };
  } catch (e) {
    return fail(e);
  }
}

export async function reclassifyAction(_p: ActionState): Promise<ActionState> {
  try {
    const user = await requireUser("manage_settings");
    const r = await reclassifyAll();
    await audit("stories.reclassified", "settings", "priorityRules", user.id, r);
    revalidatePath("/", "layout");
    return { ok: true, message: `Re-classified ${r.total} stories (${r.changed} changed priority). Manual overrides were kept.` };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Staff ----------

export async function inviteStaffAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("manage_staff");
    if (!productionAccess().enabled) throw new Error("Invitations are disabled until verified email delivery is configured.");
    const email = z
      .string()
      .email()
      .parse(String(fd.get("email") ?? "").trim());
    const name = z
      .string()
      .trim()
      .min(1, "Enter the person's name.")
      .max(100)
      .parse(String(fd.get("name") ?? ""));
    const role = z.enum(ROLES).parse(fd.get("role"));
    await createInvitation({ email, name, role, invitedBy: { id: user.id, name: user.name || user.email } });
    revalidatePath("/settings");
    return { ok: true, message: `Invitation sent to ${name} (${email}). It's also in Email outbox → Invitations.` };
  } catch (e) {
    return fail(e);
  }
}

export async function setStaffStatusAction(fd: FormData) {
  const user = await requireUser("manage_staff");
  await setUserStatus(id.parse(fd.get("userId")), fd.get("status") === "disabled" ? "disabled" : "active", user.id);
  revalidatePath("/settings");
}

export async function setStaffRoleAction(fd: FormData) {
  const user = await requireUser("manage_staff");
  await setUserRole(id.parse(fd.get("userId")), z.enum(ROLES).parse(fd.get("role")), user.id);
  revalidatePath("/settings");
}

export async function deleteStaffAction(fd: FormData) {
  const user = await requireUser("manage_staff");
  await deleteUser(id.parse(fd.get("userId")), user.id);
  revalidatePath("/", "layout");
}
