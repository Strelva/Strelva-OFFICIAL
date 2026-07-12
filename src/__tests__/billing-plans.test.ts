import { describe, it, expect } from "vitest";
import { PLANS, DEFAULT_PLAN, planByKey } from "@/lib/billing-plans";

describe("billing plans", () => {
  it("has the three tiers at the right monthly prices", () => {
    expect(PLANS.map((p) => [p.key, p.monthly])).toEqual([
      ["presence", 99],
      ["growth", 199],
      ["scale", 499],
    ]);
  });
  it("every plan has a non-empty price id", () => {
    for (const p of PLANS) expect(p.priceId).toMatch(/^price_/);
  });
  it("planByKey resolves a known tier, and falls back to the default for unknown/empty", () => {
    expect(planByKey("scale").key).toBe("scale");
    expect(planByKey(undefined).key).toBe(DEFAULT_PLAN);
    expect(planByKey("bogus").key).toBe(DEFAULT_PLAN);
    expect(DEFAULT_PLAN).toBe("growth");
  });
});
