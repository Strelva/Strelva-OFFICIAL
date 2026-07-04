import { describe, expect, it } from "vitest";
import { shouldSendReport } from "@/lib/report-cadence";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (now: Date, n: number) => now.getTime() - n * DAY_MS;

// A day near the START of a month (the first weekly cron run of the month) and a
// day in the MIDDLE — the monthly cadence pins the send to the start.
const startOfMonth = new Date("2026-08-03T09:00:00Z"); // day 3
const midMonth = new Date("2026-08-15T09:00:00Z"); // day 15

describe("shouldSendReport — cadence decision", () => {
  it("always sends the first-ever report (no last-sent), on either cadence", () => {
    expect(shouldSendReport("monthly", null, midMonth)).toBe(true);
    expect(shouldSendReport("weekly", null, midMonth)).toBe(true);
  });

  describe("monthly", () => {
    it("is SKIPPED mid-month when it was already sent this cycle", () => {
      // Sent ~10 days ago, and it's the middle of the month: not due.
      expect(shouldSendReport("monthly", daysAgo(midMonth, 10), midMonth)).toBe(false);
    });

    it("is SKIPPED at the start of the month if the last send was too recent", () => {
      // A start-of-month run, but only 12 days since the last report — the align
      // guard (>=20 days) holds it back so there's no double-send.
      expect(shouldSendReport("monthly", daysAgo(startOfMonth, 12), startOfMonth)).toBe(false);
    });

    it("is SENT at the start of the month once a full cycle has passed", () => {
      // ~31 days since last, first run of the month: due.
      expect(shouldSendReport("monthly", daysAgo(startOfMonth, 31), startOfMonth)).toBe(true);
    });

    it("is SENT once past the hard ceiling even away from the start of the month", () => {
      // Never let a monthly tenant go silent beyond ~5 weeks.
      expect(shouldSendReport("monthly", daysAgo(midMonth, 36), midMonth)).toBe(true);
    });
  });

  describe("weekly", () => {
    it("is SENT when a full week has passed", () => {
      expect(shouldSendReport("weekly", daysAgo(midMonth, 7), midMonth)).toBe(true);
    });

    it("is SKIPPED inside the same week (guards a same-week re-run)", () => {
      expect(shouldSendReport("weekly", daysAgo(midMonth, 2), midMonth)).toBe(false);
    });
  });
});
