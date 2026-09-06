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
  it.each(["/workspace", "/workspace#handoff=secret", "https://strelva.com/workspace?workspaceId=private", "POST /api/workspace", "https://strelva.com/api/workspace", "/client/example/api/workspace"])("excludes private telemetry: %s", (url) => {
    expect(isPrivateWorkspaceLocation(url)).toBe(true);
  });
  it.each(["/", "/ai-visibility", "/dashboard", "/workspace-other", undefined])("preserves unrelated telemetry: %s", (url) => {
    expect(isPrivateWorkspaceLocation(url)).toBe(false);
  });
});
