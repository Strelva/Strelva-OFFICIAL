import { describe, expect, it } from "vitest";
import { selectWorkspaceLocation } from "@/experience/workspace/workspace-selection";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";

type Input = Parameters<typeof selectWorkspaceLocation>[1];
const empty: Input = { work: [], products: [], workspaceExitReadStatus: "available" };
const work = (productId: string) => ({ id: "saved", productId, title: "Saved result" }) as WorkspaceSnapshot["work"][number];
const resolve = (query: string, data: Input = empty) => selectWorkspaceLocation(new URLSearchParams(query), data);

describe("workspace navigation selection", () => {
  it("shows first-use assessment only for an empty workspace that has not completed exit", () => {
    expect(resolve("")).toMatchObject({ home: true, showAssessment: true, selectedWorkId: null });
    expect(resolve("", { ...empty, workspaceExitReadStatus: "completed" }).showAssessment).toBe(false);
    expect(resolve("", { ...empty, work: [work("documents")] }).showAssessment).toBe(false);
  });

  it.each([
    ["tracker", "tracker"], ["documents", "document"], ["work_plans", "plan"],
    ["applications", "applications"], ["websites", "websites"], ["custom-applications", "custom-applications"],
    ["onboarding", "onboarding"], ["scheduling", "scheduling"], ["investigations", "investigations"],
    ["operations", "operations"], ["product-learning", "product-learning"],
  ])("reopens a saved %s in its existing product view", (productId, view) => {
    expect(resolve("work=saved", { ...empty, work: [work(productId)] })).toMatchObject({ selectedWorkId: "saved", view, home: false, missingWork: false });
  });

  it("does not substitute another result for a missing deep link", () => {
    expect(resolve("work=missing", { ...empty, work: [work("documents")] })).toMatchObject({ selectedWorkId: null, missingWork: true, showAssessment: false });
  });

  it("retains access precedence and exact assignment or responsibility selection", () => {
    expect(resolve("view=access&work=saved", { ...empty, work: [work("applications")] }).view).toBe("agency");
    expect(resolve("standingId=standing&work=missing")).toMatchObject({ view: "operations", selectedStandingId: "standing", missingWork: false });
    expect(resolve("assignmentId=assignment")).toMatchObject({ view: "operations", selectedAssignmentId: "assignment", home: false });
  });

  it("honors inquiry availability and explicit tenant before defaults", () => {
    const data = { ...empty, products: [{ id: "inquiries", name: "Inquiries", description: "", availability: "available" as const }] };
    expect(selectWorkspaceLocation(new URLSearchParams("view=inquiries&tenantId=explicit"), data, { tenantId: "default" })).toMatchObject({ view: "inquiries", inquiryTenantId: "explicit" });
    expect(resolve("view=inquiries", empty).view).toBe("work");
  });
});
