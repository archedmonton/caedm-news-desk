import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DB } from "./db/client";
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
  digestEnabled: z.boolean(),
  digestTime: hhmm,
  digestRecipient: z.string().email(),
  digestLookbackHours: z.coerce.number().int().min(6).max(72),
  alertsEnabled: z.boolean(),
  alertRecipient: z.string().email(),
  alertMinPriority: z.enum(["P0", "P1"]),
  alertWindowStart: hhmm,
  alertWindowEnd: hhmm,
  alertP0BypassWindow: z.boolean(),
  alertMaxPerHour: z.coerce.number().int().min(1).max(20),
  alertMaxPerDay: z.coerce.number().int().min(1).max(100),
});

export type AppSettings = z.infer<typeof settingsSchema> & { priorityRules: PriorityRules };

export const DEFAULT_SETTINGS: AppSettings = {
  checkIntervalMinutes: 30,
  digestEnabled: true,
  digestTime: "07:30",
  digestRecipient: "communications@caedm.ca",
  digestLookbackHours: 24,
  alertsEnabled: true,
  alertRecipient: "communications@caedm.ca",
  alertMinPriority: "P1",
  alertWindowStart: "07:00",
  alertWindowEnd: "21:00",
  alertP0BypassWindow: true,
  alertMaxPerHour: 3,
  alertMaxPerDay: 10,
  priorityRules: DEFAULT_PRIORITY_RULES,
};

type Key = keyof AppSettings;

export function getSettings(db: DB = getDb()): AppSettings {
  const rows = db.select().from(applicationSettings).all();
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

export function setSettings(values: Partial<AppSettings>, userId: number | null, db: DB = getDb()) {
  const updatedAt = Date.now();
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(values) as [Key, unknown][]) {
      if (!(key in DEFAULT_SETTINGS)) continue;
      const existing = tx.select().from(applicationSettings).where(eq(applicationSettings.key, key)).get();
      if (existing) {
        tx.update(applicationSettings)
          .set({ value, updatedAt, updatedBy: userId })
          .where(eq(applicationSettings.key, key))
          .run();
      } else {
        tx.insert(applicationSettings).values({ key, value, updatedAt, updatedBy: userId }).run();
      }
    }
  });
}

/** Internal key/value state (worker heartbeat, etc.) stored alongside settings. */
export function getState<T>(key: string, db: DB = getDb()): T | undefined {
  const row = db.select().from(applicationSettings).where(eq(applicationSettings.key, `state:${key}`)).get();
  return row?.value as T | undefined;
}

export function setState(key: string, value: unknown, db: DB = getDb()) {
  db.insert(applicationSettings)
    .values({ key: `state:${key}`, value, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: applicationSettings.key, set: { value, updatedAt: Date.now() } })
    .run();
}
