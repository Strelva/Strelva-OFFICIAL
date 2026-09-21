import { describe, expect, it } from "vitest";
import { summarizeTrackerComparison } from "@/products/tracker/comparison";
import { presentWorkspaceWork } from "@/experience/workspace/result";
import { isPrivateWorkspaceLocation } from "@/lib/workspace-privacy";
import { createTrackerFromImport, trackerWorkPayload } from "@/products/tracker/engine";

describe("workspace result and privacy boundaries", () => {
  it("reopens a supported tracker with its source plan without exposing private rows in the work list", () => {
    const tracker = createTrackerFromImport({ fileName: "tasks.csv", mimeType: "text/csv", content: "Task\nPrivate task\n" }, { trackerId: "tracker", actorId: "actor" });
    const work = presentWorkspaceWork({ id: "saved", workspaceId: "personal", productId: "tracker", resourceKind: "tracker", title: "Tasks",
      payload: trackerWorkPayload(tracker), sourceWorkId: "source-plan", createdBy: "actor", createdAt: "today", updatedAt: "today" });
    expect(work.unavailableReason).toBeUndefined();
    expect(work.sourceWorkId).toBe("source-plan");
    expect(work.payload).toBeNull();
    expect(JSON.stringify(work)).not.toContain("Private task");
  });
  it("retains an unknown product without trying to render or expose its payload", () => {
    const work = presentWorkspaceWork({ id: "saved", workspaceId: "personal", productId: "future", resourceKind: "new_result",
      payload: { secret: "not a renderer contract" }, createdBy: "actor", createdAt: "today", updatedAt: "today" });
    expect(work.payload).toBeNull();
    expect(work.unavailableReason).toContain("not available");
    expect(work.productId).toBe("future");
  });
  it("does not let a corrupt assessment blank all saved work", () => {
    const work = presentWorkspaceWork({ id: "saved", workspaceId: "personal", productId: "ai_visibility", resourceKind: "ai_visibility_assessment",
      payload: null, createdBy: "actor", createdAt: "today", updatedAt: "today" });
    expect(work.payload).toBeNull();
    expect(work.unavailableReason).toContain("could not be displayed");
  });
  it("redacts inputs when a known product has an unknown resource kind", () => {
    const work = presentWorkspaceWork({
      id: "saved",
      workspaceId: "personal",
      productId: "ai_visibility",
      resourceKind: "future_ai_visibility_resource",
      payload: { secret: "not a renderer contract" },
      input: { business: "Private business", category: "Private category" },
      createdBy: "actor",
      createdAt: "today",
      updatedAt: "today",
    });
    expect(work.payload).toBeNull();
    expect(work.input).toEqual({});
  });
  it("projects tracker experiments without exposing the stored payload", () => {
    const work = presentWorkspaceWork({
      id: "experiment",
      workspaceId: "personal",
      productId: "research",
      resourceKind: "experiment",
      title: "Experiment: Harbor tracker",
      payload: {
        version: 1,
        targetWorkId: "tracker-work",
        targetRevision: 3,
        recordedBy: "operator",
        recordedAt: "2026-09-11T12:00:00.000Z",
        hypothesis: "Reviewing a tracker is faster.",
        workload: "Ten imported rows and two edits.",
        baselineMinutes: 30,
        setupMinutes: 4,
        reviewMinutes: 8,
        correctionMinutes: 2,
        providerCostUsd: null,
        result: "passed",
        evidence: "Recorded review notes.",
        observedMinutes: 14,
        differenceMinutes: 16,
        evidenceKind: "operator_reported",
        promoted: false,
        internalOnlyDetail: "must not reach the browser",
      },
      sourceWorkId: "tracker-work",
      createdBy: "operator",
      createdAt: "2026-09-11T12:00:00.000Z",
      updatedAt: "2026-09-11T12:00:00.000Z",
    });
    expect(work.experiment?.hypothesis).toBe("Reviewing a tracker is faster.");
    expect(work.sourceWorkId).toBe("tracker-work");
    expect(work.payload).toBeNull();
    expect(JSON.stringify(work)).not.toContain("internalOnlyDetail");
  });
  it("projects v2 comparisons with support, maintenance, unknown cost and explicit experimental status", () => {
    const comparison = summarizeTrackerComparison({
      hypothesis: "A tracker reduces correction time.",
      workload: "The same ten imported rows",
      inputScope: "Synthetic rows from tracker revision 2",
      baseline: {
        id: "baseline",
        label: "Manual spreadsheet",
        version: "current",
        setupMinutes: 2,
        reviewMinutes: 10,
        correctionMinutes: 4,
        supportMinutes: 3,
        maintenanceMinutes: 1,
        providerCostUsd: null,
        result: "passed",
      },
      candidates: [{
        id: "tracker",
        label: "Saved tracker",
        version: "v2",
        setupMinutes: 1,
        reviewMinutes: 5,
        correctionMinutes: 2,
        supportMinutes: 1,
        maintenanceMinutes: 1,
        providerCostUsd: null,
        result: "inconclusive",
      }],
      evidenceKind: "operator_reported",
      evidence: "Operator timing only.",
      testFailures: ["No customer workload yet."],
      decision: "needs_more_evidence",
    });
    const work = presentWorkspaceWork({
      id: "comparison",
      workspaceId: "personal",
      productId: "research",
      resourceKind: "experiment",
      title: "Experiment: Saved tracker",
      payload: {
        ...comparison,
        targetWorkId: "tracker-work",
        targetRevision: 2,
        recordedBy: "operator",
        recordedAt: "2026-09-11T12:00:00.000Z",
        internalOnlyDetail: "must not reach the browser",
      },
      sourceWorkId: "tracker-work",
      createdBy: "operator",
      createdAt: "2026-09-11T12:00:00.000Z",
      updatedAt: "2026-09-11T12:00:00.000Z",
    });
    const projected = work.experiment && "kind" in work.experiment ? work.experiment : null;
    expect(projected?.version).toBe(2);
    expect(projected?.kind).toBe("candidate_comparison");
    expect(projected?.baseline.supportMinutes).toBe(3);
    expect(projected?.candidates[0]?.maintenanceMinutes).toBe(1);
    expect(projected?.comparisons[0]?.providerCostStatus).toBe("unknown");
    expect(projected?.promoted).toBe(false);
    expect(projected?.status).toBe("experimental");
    expect(work.payload).toBeNull();
    expect(JSON.stringify(work)).not.toContain("internalOnlyDetail");
  });
  it.each(["/workspace", "/workspace#handoff=secret", "https://strelva.com/workspace?workspaceId=private", "POST /api/workspace", "https://strelva.com/api/workspace", "/client/example/api/workspace"])("excludes private telemetry: %s", (url) => {
    expect(isPrivateWorkspaceLocation(url)).toBe(true);
  });
  it.each(["/", "/ai-visibility", "/dashboard", "/workspace-other", undefined])("preserves unrelated telemetry: %s", (url) => {
    expect(isPrivateWorkspaceLocation(url)).toBe(false);
  });
  it.each([
    "/business/example?record=private",
    "https://app.strelva.com/business/example",
    "POST /api/inquiry-workspace",
    "/api/inquiry-workspace?tenant=example",
    "/preview/strelva/inquiries",
  ])("excludes inquiry work telemetry: %s", (url) => {
    expect(isPrivateWorkspaceLocation(url)).toBe(true);
  });
  it.each(["/business-news", "/api/inquiry-workspace-other"])("does not overmatch inquiry routes: %s", (url) => {
    expect(isPrivateWorkspaceLocation(url)).toBe(false);
  });
});
