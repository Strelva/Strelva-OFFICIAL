import { describe, expect, it } from "vitest";
import { summarizeTrackerExperiment } from "@/products/tracker/experiment";

describe("R&D evidence", () => {
  it("includes correction and review effort without inventing provider costs", () => {
    const result = summarizeTrackerExperiment({ hypothesis: "Reduce preparation", workload: "Same sample rows", baselineMinutes: 10, setupMinutes: 4, reviewMinutes: 3, correctionMinutes: 5, providerCostUsd: null, result: "inconclusive", evidence: "Manual timings; no customer result yet" });
    expect(result.observedMinutes).toBe(12);
    expect(result.differenceMinutes).toBe(-2);
    expect(result.providerCostUsd).toBeNull();
    expect(result.evidenceKind).toBe("operator_reported");
    expect(result.promoted).toBe(false);
  });
});
