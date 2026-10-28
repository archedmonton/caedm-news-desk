import { describe, expect, it } from "vitest";
import { edmontonDateKey, edmontonDayRange, isWithinLocalWindow, scheduledInstantForDay, zonedParts, zonedTimeToUtc } from "@/lib/time";

describe("Edmonton time helpers", () => {
  it("converts 07:30 MDT (summer, UTC-6) to 13:30 UTC", () => {
    expect(new Date(zonedTimeToUtc(2026, 10, 28, 7, 30)).toISOString()).toBe("2026-10-28T13:30:00.000Z");
  });

  it("converts 07:30 MST (winter, UTC-7) to 14:30 UTC", () => {
    expect(new Date(zonedTimeToUtc(2026, 11, 2, 7, 30)).toISOString()).toBe("2026-11-02T14:30:00.000Z");
    expect(new Date(zonedTimeToUtc(2027, 1, 15, 7, 30)).toISOString()).toBe("2027-01-15T14:30:00.000Z");
  });

  it("handles the DST transition days", () => {
    // Spring forward 2026-03-08 02:00 → 03:00; 07:30 is after the change → MDT.
    expect(new Date(zonedTimeToUtc(2026, 3, 8, 7, 30)).toISOString()).toBe("2026-03-08T13:30:00.000Z");
    // Fall back 2026-11-01 02:00 → 01:00; 07:30 is MST.
    expect(new Date(zonedTimeToUtc(2026, 11, 1, 7, 30)).toISOString()).toBe("2026-11-01T14:30:00.000Z");
    // Non-existent 02:30 on spring-forward day resolves to a real instant on that day.
    const gap = zonedTimeToUtc(2026, 3, 8, 2, 30);
    expect(zonedParts(gap).day).toBe(8);
    expect(zonedParts(gap).hour).toBe(3);
    // Ambiguous 01:30 on fall-back day resolves to the first (MDT) occurrence.
    expect(new Date(zonedTimeToUtc(2026, 11, 1, 1, 30)).toISOString()).toBe("2026-11-01T07:30:00.000Z");
  });

  it("schedules 07:30 for the Edmonton day, not the UTC day", () => {
    // 2026-10-29 03:00 UTC is still Oct 28 in Edmonton (21:00 MDT).
    const at = Date.parse("2026-10-29T03:00:00Z");
    expect(edmontonDateKey(at)).toBe("2026-10-28");
    expect(new Date(scheduledInstantForDay(at, "07:30")).toISOString()).toBe("2026-10-28T13:30:00.000Z");
  });

  it("evaluates alert windows including midnight wrap", () => {
    const at = (iso: string) => Date.parse(iso);
    expect(isWithinLocalWindow(at("2026-10-28T13:30:00Z"), "07:00", "21:00")).toBe(true); // 07:30 MDT
    expect(isWithinLocalWindow(at("2026-10-29T04:00:00Z"), "07:00", "21:00")).toBe(false); // 22:00 MDT
    expect(isWithinLocalWindow(at("2026-10-29T04:00:00Z"), "21:00", "06:00")).toBe(true);
  });

  it("builds Edmonton day ranges for date filters", () => {
    const r = edmontonDayRange("2026-11-01")!; // 25-hour day
    expect(r.end - r.start).toBe(25 * 3600_000);
    expect(edmontonDayRange("bad")).toBeNull();
  });
});
