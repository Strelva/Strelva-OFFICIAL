/**
 * Regression coverage for `zonedTodayIso` — the tenant-local "today".
 *
 * Bookings store their date as the tenant-LOCAL YYYY-MM-DD. The roster + the
 * Schedule "this week" verdict must resolve "today" in the tenant's timezone,
 * not UTC: after ~8pm ET a plain `new Date().toISOString()` rolls to tomorrow
 * and hides tonight's appointments. These lock the day-boundary behavior.
 */
import { describe, expect, it } from "vitest";
import { zonedTodayIso } from "@/lib/booking";

describe("zonedTodayIso", () => {
  it("returns the tenant-local day, not the UTC day, past the evening boundary", () => {
    // 01:00 UTC on Jul 8 is 21:00 EDT on Jul 7 — the exact case that regressed.
    const instant = new Date("2026-07-08T01:00:00Z");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-07-08"); // the UTC bug
    expect(zonedTodayIso("America/New_York", instant)).toBe("2026-07-07");
  });

  it("agrees with UTC earlier in the tenant's day", () => {
    // 15:00 UTC on Jul 8 is 11:00 EDT on Jul 8 — same calendar day either way.
    const instant = new Date("2026-07-08T15:00:00Z");
    expect(zonedTodayIso("America/New_York", instant)).toBe("2026-07-08");
  });

  it("handles a west-coast tenant across the same boundary", () => {
    // 01:00 UTC on Jul 8 is 18:00 PDT on Jul 7.
    const instant = new Date("2026-07-08T01:00:00Z");
    expect(zonedTodayIso("America/Los_Angeles", instant)).toBe("2026-07-07");
  });

  it("returns the UTC day for a UTC tenant", () => {
    const instant = new Date("2026-07-08T01:00:00Z");
    expect(zonedTodayIso("UTC", instant)).toBe("2026-07-08");
  });

  it("formats as zero-padded YYYY-MM-DD", () => {
    const instant = new Date("2026-03-05T12:00:00Z");
    expect(zonedTodayIso("America/New_York", instant)).toBe("2026-03-05");
  });
});
