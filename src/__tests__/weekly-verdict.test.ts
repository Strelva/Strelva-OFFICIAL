import { describe, it, expect } from "vitest";
import { buildVerdict } from "@/lib/weekly-verdict";
import type { WeeklyBrief } from "@/lib/types";

const stats = (pageViews: number, pageViewsDelta?: number): WeeklyBrief["stats"] =>
  ({ pageViews, pageViewsDelta, bookingClicks: 0, reviewsReceived: 0, contentUpdates: 0 }) as WeeklyBrief["stats"];

describe("buildVerdict", () => {
  it("calls out a quiet week with no visitors", () => {
    expect(buildVerdict(stats(0))).toMatch(/quiet week/i);
  });

  it("says it's working when traffic is up", () => {
    const v = buildVerdict(stats(47, 12));
    expect(v).toMatch(/it's working/i);
    expect(v).toContain("47 people found you");
  });

  it("flags a down week without spin", () => {
    const v = buildVerdict(stats(30, -5));
    expect(v).toMatch(/down from last week/i);
    expect(v).not.toMatch(/it's working/i);
  });

  it("states a flat week plainly", () => {
    const v = buildVerdict(stats(20, 0));
    expect(v).toContain("20 people found you");
    expect(v).not.toMatch(/up|down/i);
  });

  it("uses singular for one visitor", () => {
    expect(buildVerdict(stats(1, 1))).toContain("1 person found you");
  });
});
