/** Personal brief times offered in Notifications & alerts: every half hour, 5:00 a.m. to 9:00 p.m. Edmonton. */
export const BRIEF_TIMES: string[] = Array.from({ length: 33 }, (_, i) => {
  const minutes = 5 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

const clock = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

/** "07:30" → "7:30 am" (a wall-clock label, not an instant). */
export function formatClock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return clock.format(Date.UTC(2000, 0, 1, h, m)).replace(/\./g, "");
}

/** e.g. "Weekdays at 7:30 am" */
export function briefScheduleLabel(u: { digestTime: string | null; digestDays: "daily" | "weekdays" }, defaultTime: string) {
  return `${u.digestDays === "weekdays" ? "Weekdays" : "Every day"} at ${formatClock(u.digestTime ?? defaultTime)}`;
}
