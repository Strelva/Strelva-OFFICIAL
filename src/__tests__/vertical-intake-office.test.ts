import { describe, expect, it } from "vitest";
import { officeHoursNow } from "@/products/vertical-intake/office";
import { pickVisitSlot, slotMatchesPreference } from "@/products/vertical-intake/preferences";

const hours = { timezone: "America/New_York", weekly: [{ day: 2, opens: "08:00", closes: "17:00" }, { day: 3, opens: "09:00", closes: "12:00" }, { day: 3, opens: "13:00", closes: "17:00" }] };

describe("officeHoursNow", () => {
  it("uses the office's own clock across a UTC date boundary", () => {
    // 2026-10-21 02:00Z is Tuesday 10:00pm in New York: Tuesday hours, closed.
    expect(officeHoursNow(hours, new Date("2026-10-21T02:00:00Z"))).toEqual({ openNow: false, todayHours: "8:00 AM–5:00 PM" });
    // 2026-10-21 15:00Z is Wednesday 11:00am in New York.
    expect(officeHoursNow(hours, new Date("2026-10-21T15:00:00Z"))).toEqual({ openNow: true, todayHours: "9:00 AM–12:00 PM, 1:00 PM–5:00 PM" });
  });

  it("says closed on a day with no hours", () => {
    expect(officeHoursNow(hours, new Date("2026-10-24T15:00:00Z"))).toEqual({ openNow: false, todayHours: "Closed today" });
  });

  it("returns nulls for an invalid shape", () => {
    const none = { openNow: null, todayHours: null };
    expect(officeHoursNow(null, new Date())).toEqual(none);
    expect(officeHoursNow({ timezone: "Nowhere/Land", weekly: [] }, new Date())).toEqual(none);
    expect(officeHoursNow({ timezone: "America/New_York", weekly: [{ day: 9, opens: "08:00", closes: "09:00" }] }, new Date())).toEqual(none);
  });
});

describe("pickVisitSlot", () => {
  const now = new Date("2026-10-20T12:00:00Z"); // Tue 8:00am New York
  const slots = [
    { start: "2026-10-20T13:00:00Z", end: "2026-10-20T14:00:00Z" }, // 9am, less than 2h out
    { start: "2026-10-20T19:00:00Z", end: "2026-10-20T20:00:00Z" }, // Tue 3pm
    { start: "2026-10-22T14:00:00Z", end: "2026-10-22T15:00:00Z" }, // Thu 10am
  ];
  const tz = "America/New_York";

  it("urgent takes the first slot more than 2 hours out", () => {
    expect(pickVisitSlot(slots, tz, {}, "urgent", now)).toEqual(slots[1]);
  });

  it("routine respects days and times", () => {
    expect(pickVisitSlot(slots, tz, { preferred_days: "thu", preferred_times: "morning" }, "routine", now)).toEqual(slots[2]);
    expect(pickVisitSlot(slots, tz, { preferred_times: "afternoon" }, "routine", now)).toEqual(slots[1]);
  });

  it("no preference picks the first allowed slot, and nothing matching gives null", () => {
    expect(pickVisitSlot(slots, tz, {}, "routine", now)).toEqual(slots[1]);
    expect(pickVisitSlot(slots, tz, { preferred_days: "sat" }, "routine", now)).toBeNull();
  });

  it("matches evening from 5pm local", () => {
    expect(slotMatchesPreference("2026-10-20T21:00:00Z", tz, [], ["evening"])).toBe(true);
    expect(slotMatchesPreference("2026-10-20T20:59:00Z", tz, [], ["evening"])).toBe(false);
  });
});
