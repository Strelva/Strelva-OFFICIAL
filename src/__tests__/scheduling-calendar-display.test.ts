import { describe, expect, it } from "vitest";
import { calendarWallDate, openCalendarIntervals } from "@/experience/scheduling/calendar-display";
const window = { start: "2026-10-14T09:00:00-04:00", end: "2026-10-14T17:00:00-04:00" };
const reservation = (start: number, end: number, status = "reserved") => ({ requestId: `${start}`, title: "Session", status, start: `2026-10-14T${String(start).padStart(2, "0")}:00:00-04:00`, end: `2026-10-14T${String(end).padStart(2, "0")}:00:00-04:00` });
describe("schedule calendar display", () => {
  it("shows only remaining availability after a reservation", () => {
    expect(openCalendarIntervals([window], [reservation(9, 13)])).toEqual([{ start: "2026-10-14T17:00:00.000Z", end: "2026-10-14T21:00:00.000Z" }]);
  });
  it("keeps pending and unknown provider writes occupied while cancellation reopens time", () => {
    expect(openCalendarIntervals([window], [reservation(9, 11, "writing"), reservation(11, 13, "unknown"), reservation(13, 17, "cancelled")])).toEqual([{ start: "2026-10-14T17:00:00.000Z", end: "2026-10-14T21:00:00.000Z" }]);
  });
  it("clips overlapping reservations and preserves split windows", () => {
    expect(openCalendarIntervals([window], [reservation(8, 10), reservation(12, 14), reservation(13, 18)])).toEqual([{ start: "2026-10-14T14:00:00.000Z", end: "2026-10-14T16:00:00.000Z" }]);
  });
  it("uses the selected timezone for day and time, including a midnight crossing", () => {
    expect(calendarWallDate("2026-10-14T02:30:00Z", "America/New_York").toISOString()).toBe("2026-10-13T22:30:00.000Z");
  });
});
