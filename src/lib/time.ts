export const TIMEZONE = "America/Edmonton";

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const PARTS_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
};
const partsFormatter = new Intl.DateTimeFormat("en-CA", { ...PARTS_OPTS, timeZone: TIMEZONE });

/** Wall-clock parts of an instant in America/Edmonton. */
export function zonedParts(at: number | Date, tz = TIMEZONE): ZonedParts {
  const fmt = tz === TIMEZONE ? partsFormatter : new Intl.DateTimeFormat("en-CA", { ...PARTS_OPTS, timeZone: tz });
  const p = Object.fromEntries(fmt.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** UTC offset (ms) of the zone at an instant: local = utc + offset. */
export function zoneOffsetMs(at: number, tz = TIMEZONE): number {
  const p = zonedParts(at, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at / 1000) * 1000;
}

/**
 * Convert an Edmonton wall-clock time to a UTC instant. Non-existent times (spring-forward gap) resolve
 * forward; ambiguous times (fall-back) resolve to the first occurrence.
 */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, tz = TIMEZONE) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const o1 = zoneOffsetMs(guess, tz);
  const candidate = guess - o1;
  const o2 = zoneOffsetMs(candidate, tz);
  if (o1 === o2) {
    // Ambiguous fall-back hour: prefer the earlier instant if it maps to the same wall time.
    const earlier = guess - Math.max(o1, zoneOffsetMs(candidate - 3600_000, tz));
    const pe = zonedParts(earlier, tz);
    if (earlier < candidate && pe.hour === hour && pe.minute === minute && pe.day === day) return earlier;
    return candidate;
  }
  const alt = guess - o2;
  const pa = zonedParts(alt, tz);
  if (pa.hour === hour && pa.minute === minute) return alt;
  // Gap: wall time doesn't exist; use the instant after the transition.
  return Math.max(candidate, alt);
}

/** Edmonton calendar date key, e.g. "2026-10-28". */
export function edmontonDateKey(at: number | Date): string {
  const p = zonedParts(at);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function parseHHMM(value: string): { hour: number; minute: number } {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m) throw new Error(`Invalid time "${value}" (expected HH:MM)`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/** The UTC instant of HH:MM on the Edmonton date containing `at`. */
export function scheduledInstantForDay(at: number, hhmm: string): number {
  const p = zonedParts(at);
  const { hour, minute } = parseHHMM(hhmm);
  return zonedTimeToUtc(p.year, p.month, p.day, hour, minute);
}

/** Minutes since local midnight in Edmonton. */
export function edmontonMinuteOfDay(at: number): number {
  const p = zonedParts(at);
  return p.hour * 60 + p.minute;
}

/** True if `at` falls in [start, end) Edmonton local time; supports windows wrapping midnight. */
export function isWithinLocalWindow(at: number, start: string, end: string): boolean {
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  const m = edmontonMinuteOfDay(at);
  const sm = s.hour * 60 + s.minute;
  const em = e.hour * 60 + e.minute;
  if (sm === em) return true;
  return sm < em ? m >= sm && m < em : m >= sm || m < em;
}

const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, month: "long", day: "numeric", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, hour: "numeric", minute: "2-digit" });

export const formatLongDate = (at: number | Date) => dateFmt.format(new Date(at));
export const formatDateTime = (at: number | Date | null | undefined) => (at == null ? "—" : dateTimeFmt.format(new Date(at)).replace(/\./g, ""));
export const formatTime = (at: number | Date) => timeFmt.format(new Date(at)).replace(/\./g, "");

export function formatRelative(at: number | null | undefined, now = Date.now()): string {
  if (at == null) return "never";
  const diff = Math.round((now - at) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff} min ago`;
  const h = Math.round(diff / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return formatDateTime(at);
}

/** Parse an `<input type="date">` value as Edmonton start-of-day / end-of-day instants. */
export function edmontonDayRange(dateKey: string): { start: number; end: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const start = zonedTimeToUtc(y, mo, d, 0, 0);
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  const end = zonedTimeToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0);
  return { start, end };
}
