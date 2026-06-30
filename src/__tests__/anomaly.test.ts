import { describe, expect, it } from "vitest";
import { detectTrafficAnomaly } from "@/lib/anomaly";
import type { DailyMetric } from "@/lib/storage";

/** 21 baseline days (June) then 7 recent days (July) — sorts correctly. */
function build(baselinePerDay: number, recentPerDay: number): DailyMetric[] {
  const out: DailyMetric[] = [];
  for (let i = 0; i < 21; i++) {
    out.push({ date: `2026-06-${String(i + 1).padStart(2, "0")}`, pageViews: baselinePerDay, bookingClicks: 0 });
  }
  for (let i = 0; i < 7; i++) {
    out.push({ date: `2026-07-${String(i + 1).padStart(2, "0")}`, pageViews: recentPerDay, bookingClicks: 0 });
  }
  return out;
}

describe("detectTrafficAnomaly", () => {
  it("flags a sustained traffic drop with a why and a fix", () => {
    const a = detectTrafficAnomaly(build(20, 8));
    expect(a).not.toBeNull();
    expect(a!.type).toBe("drop");
    expect(a!.headline).toContain("60%");
    expect(a!.suggestion.toLowerCase()).toContain("ask the ai");
  });

  it("flags a traffic spike with a capitalize-on-it nudge", () => {
    const a = detectTrafficAnomaly(build(5, 15));
    expect(a).not.toBeNull();
    expect(a!.type).toBe("spike");
    expect(a!.suggestion.toLowerCase()).toContain("button");
  });

  it("stays quiet when traffic is roughly steady", () => {
    expect(detectTrafficAnomaly(build(10, 11))).toBeNull();
  });

  it("won't call an anomaly on too little baseline traffic", () => {
    expect(detectTrafficAnomaly(build(2, 0))).toBeNull();
  });

  it("needs a full 4 weeks of data", () => {
    const short = build(20, 8).slice(0, 10);
    expect(detectTrafficAnomaly(short)).toBeNull();
  });
});
