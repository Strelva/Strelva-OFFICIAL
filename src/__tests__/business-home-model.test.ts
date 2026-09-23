import { describe, expect, it } from "vitest";
import { homeInsight, homeSuggestions, insightFixRequest } from "@/experience/workspace/workspace-home";
import { planWorkspaceStart } from "@/experience/workspace/workspace-start";
import type { WorkspaceWork } from "@/experience/workspace/contracts";

function visibility(id: string, createdAt: string, payload: Record<string, unknown> | null, availability = "available"): WorkspaceWork {
  return {
    id, workspaceId: "w", title: "Harbor Dental", productId: "ai_visibility", resourceKind: "ai_visibility_assessment", payload: null, input: {}, createdAt,
    assessment: { kind: "ai_visibility", availability, subject: { name: "Harbor Dental" }, payload } as unknown as WorkspaceWork["assessment"],
  };
}
const measured = { business: "Harbor Dental", score: 74, grade: "B", verdict: "Clear identity.", topFix: "Add treatment pages.", measurementStatus: "measured", readinessMeasured: true };

describe("business home model", () => {
  it("presents the newest measured AI Visibility result with its top fix", () => {
    const insight = homeInsight([visibility("old", "2026-09-01T00:00:00Z", { ...measured, grade: "D" }), visibility("new", "2026-09-07T00:00:00Z", measured)]);
    expect(insight).toMatchObject({ workId: "new", grade: "B", score: 74, topFix: "Add treatment pages.", partial: false });
  });

  it("never presents an unmeasured or unavailable scorecard", () => {
    expect(homeInsight([visibility("a", "2026-09-07T00:00:00Z", { ...measured, measurementStatus: "unavailable" })])).toBeNull();
    expect(homeInsight([visibility("b", "2026-09-07T00:00:00Z", { ...measured, readinessMeasured: false })])).toBeNull();
    expect(homeInsight([visibility("c", "2026-09-07T00:00:00Z", measured, "unavailable")])).toBeNull();
    expect(homeInsight([visibility("d", "2026-09-07T00:00:00Z", null)])).toBeNull();
  });

  it("follows what the business has and does not repeat the insight card", () => {
    const insight = homeInsight([visibility("new", "2026-09-07T00:00:00Z", measured)]);
    const withInsight = homeSuggestions({ work: [visibility("new", "2026-09-07T00:00:00Z", measured)], siteCount: 1, insight });
    expect(withInsight.map(item => item.label)).toEqual(["Improve our website", "Give my team a better way to request things", "Fix customer follow-up"]);
    expect(withInsight.some(item => item.request.includes("Add treatment pages."))).toBe(false);
    const firstRun = homeSuggestions({ work: [], siteCount: 0, insight: null });
    expect(firstRun.some(item => item.label === "See how AI describes us")).toBe(false);
    expect(firstRun.length).toBeLessThanOrEqual(3);
  });

  it("acts on the top fix instead of routing back into another assessment", () => {
    const insight = homeInsight([visibility("new", "2026-09-07T00:00:00Z", measured)])!;
    const context = { products: [{ id: "assessment", availability: "available" as const }], managedSites: [{ id: "s", title: "Harbor Dental" }] };
    expect(planWorkspaceStart(insightFixRequest(insight, 1), context).route).toBe("website");
    expect(planWorkspaceStart(insightFixRequest(insight, 0), context).route).not.toBe("assessment");
  });
});
