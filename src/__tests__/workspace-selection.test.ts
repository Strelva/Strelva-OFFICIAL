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
    expect(resolve("standingId=11111111-1111-4111-8111-111111111111&work=missing")).toMatchObject({ view: "operations", selectedStandingId: "11111111-1111-4111-8111-111111111111", missingWork: false });
    expect(resolve("assignmentId=22222222-2222-4222-8222-222222222222")).toMatchObject({ view: "operations", selectedAssignmentId: "22222222-2222-4222-8222-222222222222", home: false });
  });

  it("honors inquiry availability and explicit tenant before defaults", () => {
    const data = { ...empty, products: [{ id: "inquiries", name: "Inquiries", description: "", availability: "available" as const }] };
    expect(selectWorkspaceLocation(new URLSearchParams("view=inquiries&tenantId=explicit"), data, { tenantId: "default" })).toMatchObject({ view: "inquiries", inquiryTenantId: "explicit" });
    expect(resolve("view=inquiries", empty).view).toBe("work");
  });
});


it.each(["work=%2Fprivate", "work=", "work=saved&work=other"])("malformed work does not open the first result: %s", query => {
  expect(resolve(query, { ...empty, work: [work("documents")] })).toMatchObject({ missingWork: true, selectedWorkId: null, home: false, showAssessment: false });
});
it("incompatible System or offering detail cannot redirect work selection", () => {
  expect(resolve("view=plan&system=44444444-4444-4444-8444-444444444444&standingId=11111111-1111-4111-8111-111111111111&offering=old")).toMatchObject({ view: "plan", selectedStandingId: null });
});
