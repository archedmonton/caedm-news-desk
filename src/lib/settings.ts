import { eq, lt } from "drizzle-orm";
import { z } from "zod";
import { first, getDb, type DB } from "./db/client";
import { applicationSettings } from "./db/schema";
import { DEFAULT_PRIORITY_RULES, type PriorityRules } from "./priority/rules";
import { parseHHMM } from "./time";

const hhmm = z.string().refine((v) => {
  try {
    parseHHMM(v);
    return true;
  } catch {
    return false;
  }
}, "Use 24-hour HH:MM");

export const settingsSchema = z.object({
  checkIntervalMinutes: z.coerce.number().int().min(15).max(1440),
  /** Master switch for everyone's personal briefs. */
  digestEnabled: z.boolean(),
  /** Default brief time for people who don't choose their own. */
  digestTime: hhmm,
  digestLookbackHours: z.coerce.number().int().min(6).max(72),
  alertsEnabled: z.boolean(),
  alertMinPriority: z.enum(["P0", "P1"]),
  alertWindowStart: hhmm,
  alertWindowEnd: hhmm,
  alertP0BypassWindow: z.boolean(),
  alertMaxPerHour: z.coerce.number().int().min(1).max(20),
  alertMaxPerDay: z.coerce.number().int().min(1).max(100),
});

export type AppSettings = z.infer<typeof settingsSchema> & { priorityRules: PriorityRules };

export const DEFAULT_SETTINGS: AppSettings = {
  checkIntervalMinutes: 15,
  digestEnabled: true,
  digestTime: "08:00",
  digestLookbackHours: 24,
  alertsEnabled: true,
  alertMinPriority: "P1",
  alertWindowStart: "07:00",
  alertWindowEnd: "21:00",
  alertP0BypassWindow: true,
  alertMaxPerHour: 3,
  alertMaxPerDay: 10,
  priorityRules: DEFAULT_PRIORITY_RULES,
};

type Key = keyof AppSettings;

export async function getSettings(db: DB = getDb()): Promise<AppSettings> {
  const rows = await db.select().from(applicationSettings);
  const out: AppSettings = structuredClone(DEFAULT_SETTINGS);
  for (const row of rows) {
    if (row.key in out) {
      if (row.key === "priorityRules") {
        out.priorityRules = { ...DEFAULT_PRIORITY_RULES, ...(row.value as Partial<PriorityRules>) };
      } else {
        (out as Record<string, unknown>)[row.key] = row.value;
      }
    }
  }
  return out;
}

export async function setSettings(values: Partial<AppSettings>, userId: number | null, db: DB = getDb()) {
  const updatedAt = Date.now();
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(values) as [Key, unknown][]) {
      if (!(key in DEFAULT_SETTINGS)) continue;
      await tx
        .insert(applicationSettings)
        .values({ key, value, updatedAt, updatedBy: userId })
        .onConflictDoUpdate({ target: applicationSettings.key, set: { value, updatedAt, updatedBy: userId } });
    }
  });
}

/** Internal key/value state (worker heartbeat, etc.) stored alongside settings. */
export async function getState<T>(key: string, db: DB = getDb()): Promise<T | undefined> {
  const row = await first(
    db
      .select()
      .from(applicationSettings)
      .where(eq(applicationSettings.key, `state:${key}`)),
  );
  return row?.value as T | undefined;
}

export async function setState(key: string, value: unknown, db: DB = getDb()) {
  await db
    .insert(applicationSettings)
    .values({ key: `state:${key}`, value, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: applicationSettings.key, set: { value, updatedAt: Date.now() } });
}

/**
 * Atomic lease (e.g. "only one source refresh at a time" across serverless instances). Returns true if this
 * caller acquired it; the lease expires after `ttlMs` in case the holder crashes.
 */
export async function acquireLease(name: string, ttlMs: number, db: DB = getDb(), now = Date.now()): Promise<boolean> {
  const key = `lease:${name}`;
  const rows = await db
    .insert(applicationSettings)
    .values({ key, value: { acquiredAt: now }, updatedAt: now })
    .onConflictDoUpdate({
      target: applicationSettings.key,
      set: { value: { acquiredAt: now }, updatedAt: now },
      setWhere: lt(applicationSettings.updatedAt, now - ttlMs),
    })
    .returning({ key: applicationSettings.key });
  return rows.length > 0;
}

export async function releaseLease(name: string, db: DB = getDb()) {
  await db
    .update(applicationSettings)
    .set({ updatedAt: 0 })
    .where(eq(applicationSettings.key, `lease:${name}`));
}
