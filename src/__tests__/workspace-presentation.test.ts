import { describe, expect, it } from "vitest";
import { presentWorkspaceWork } from "@/experience/workspace/result";
import { isPrivateWorkspaceLocation } from "@/lib/workspace-privacy";

describe("workspace result and privacy boundaries", () => {
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
