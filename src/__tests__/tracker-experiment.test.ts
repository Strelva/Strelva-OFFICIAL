import { describe, expect, it } from "vitest";
import { summarizeTrackerExperiment } from "@/products/tracker/experiment";
import {
  parseTrackerExperimentComparison,
  summarizeTrackerComparison,
  trackerExperimentComparisonInputSchema,
} from "@/products/tracker/comparison";

describe("R&D evidence", () => {
  it("includes correction and review effort without inventing provider costs", () => {
    const result = summarizeTrackerExperiment({ hypothesis: "Reduce preparation", workload: "Same sample rows", baselineMinutes: 10, setupMinutes: 4, reviewMinutes: 3, correctionMinutes: 5, providerCostUsd: null, result: "inconclusive", evidence: "Manual timings; no customer result yet" });
    expect(result.observedMinutes).toBe(12);
    expect(result.differenceMinutes).toBe(-2);
    expect(result.providerCostUsd).toBeNull();
    expect(result.evidenceKind).toBe("operator_reported");
    expect(result.promoted).toBe(false);
  });

  it("compares multiple candidates against one explicit baseline and carries support and maintenance effort", () => {
    const result = summarizeTrackerComparison({
      hypothesis: "A saved tracker reduces review work.",
      workload: "The same 20 imported rows and two corrections",
      workloadKey: "synthetic-20-rows",
      inputScope: "Tracker revision 4 with the original CSV preserved",
      baseline: {
        id: "baseline",
        label: "Manual spreadsheet",
        version: "2026-09-11",
        setupMinutes: 6,
        reviewMinutes: 20,
        correctionMinutes: 4,
        supportMinutes: 3,
        maintenanceMinutes: 5,
        providerCostUsd: 0,
        result: "passed",
      },
      candidates: [{
        id: "candidate-one",
        label: "Tracker review",
        version: "v2",
        setupMinutes: 4,
        reviewMinutes: 10,
        correctionMinutes: 2,
        supportMinutes: 2,
        maintenanceMinutes: 1,
        providerCostUsd: null,
        result: "inconclusive",
        evidenceKind: "simulated",
      }, {
        id: "candidate-two",
        label: "Tracker review with measured timing",
        version: "v3",
        setupMinutes: 5,
        reviewMinutes: 12,
        correctionMinutes: 1,
        supportMinutes: 1,
        maintenanceMinutes: 2,
        providerCostUsd: 0.14,
        result: "passed",
        evidenceKind: "measured",
      }],
      evidenceKind: "operator_reported",
      evidence: "The operator timed the candidate review and recorded the open checks.",
      testFailures: ["No customer workload has been tested."],
      decision: "continue_testing",
    });

    expect(result.baseline.totalHumanMinutes).toBe(38);
    expect(result.candidates[0]?.totalHumanMinutes).toBe(19);
    expect(result.comparisons[0]).toMatchObject({
      candidateId: "candidate-one",
      humanMinutesDifference: 19,
      providerCostUsd: null,
      providerCostStatus: "unknown",
      providerCostDifferenceUsd: null,
      evidenceKind: "simulated",
    });
    expect(result.comparisons[1]).toMatchObject({
      candidateId: "candidate-two",
      humanMinutesDifference: 17,
      providerCostStatus: "known",
      providerCostDifferenceUsd: -0.14,
      evidenceKind: "measured",
    });
    expect(result.testFailures).toEqual(["No customer workload has been tested."]);
    expect(result.promoted).toBe(false);
    expect(result.status).toBe("experimental");
  });

  it("rejects candidates that do not use the same workload or reuse an option ID", () => {
    const input = {
      hypothesis: "Compare two approaches",
      workload: "Same supplied rows",
      inputScope: "Synthetic input",
      baseline: {
        id: "baseline",
        label: "Manual",
        version: "current",
        setupMinutes: 1,
        reviewMinutes: 1,
        correctionMinutes: 0,
        supportMinutes: 0,
        maintenanceMinutes: 0,
        providerCostUsd: null,
        result: "passed",
        workload: "Different rows",
      },
      candidates: [{
        id: "baseline",
        label: "Candidate",
        version: "v1",
        setupMinutes: 1,
        reviewMinutes: 1,
        correctionMinutes: 0,
        supportMinutes: 0,
        maintenanceMinutes: 0,
        providerCostUsd: null,
        result: "inconclusive",
        workload: "Same supplied rows",
      }],
      evidenceKind: "simulated",
      evidence: "Synthetic comparison",
      testFailures: [],
      decision: "needs_more_evidence",
    };
    const parsed = trackerExperimentComparisonInputSchema.safeParse(input);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.map((issue) => issue.message).join(" ")).toContain("same workload");
  });

  it("does not accept a client-supplied promotion or an unbounded candidate list", () => {
    const option = (id: string) => ({
      id,
      label: `Candidate ${id}`,
      version: "v1",
      setupMinutes: 0,
      reviewMinutes: 1,
      correctionMinutes: 0,
      supportMinutes: 0,
      maintenanceMinutes: 0,
      providerCostUsd: null,
      result: "inconclusive" as const,
    });
    const base = {
      hypothesis: "Compare bounded approaches",
      workload: "Same supplied rows",
      inputScope: "Synthetic input",
      baseline: { ...option("baseline"), label: "Baseline" },
      candidates: [option("one"), option("two"), option("three"), option("four"), option("five"), option("six")],
      evidenceKind: "operator_reported" as const,
      evidence: "Synthetic comparison",
      testFailures: [],
      decision: "stop_testing",
      promoted: true,
    };
    expect(trackerExperimentComparisonInputSchema.safeParse(base).success).toBe(false);
  });

  it("parses a server-bound comparison without exposing unrecognized stored fields to the typed result", () => {
    const comparison = summarizeTrackerComparison({
      hypothesis: "Compare one candidate",
      workload: "Same rows",
      inputScope: "Synthetic input",
      baseline: { id: "baseline", label: "Manual", version: "current", setupMinutes: 1, reviewMinutes: 2, correctionMinutes: 0, supportMinutes: 0, maintenanceMinutes: 1, providerCostUsd: null, result: "passed" },
      candidates: [{ id: "candidate", label: "Tracker", version: "v1", setupMinutes: 1, reviewMinutes: 1, correctionMinutes: 0, supportMinutes: 0, maintenanceMinutes: 0, providerCostUsd: 0.01, result: "inconclusive" }],
      evidenceKind: "operator_reported",
      evidence: "Recorded locally",
      testFailures: [],
      decision: "needs_more_evidence",
    });
    const parsed = parseTrackerExperimentComparison({
      ...comparison,
      targetWorkId: "tracker-work",
      targetRevision: 3,
      recordedBy: "operator",
      recordedAt: "2026-09-11T12:00:00.000Z",
      internalOnlyDetail: "must not become part of the typed contract",
    });
    expect(parsed?.targetWorkId).toBe("tracker-work");
    expect(parsed?.comparisons[0]?.providerCostDifferenceUsd).toBeNull();
    expect(JSON.stringify(parsed)).not.toContain("internalOnlyDetail");
  });
});
