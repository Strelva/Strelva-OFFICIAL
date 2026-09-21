import { describe, expect, it } from "vitest";
import { planWorkspaceStart, createWorkspaceStartContinuation, type WorkspaceStartContext } from "@/experience/workspace/workspace-start";

const context: WorkspaceStartContext = { products: [{ id: "websites", availability: "available" }], native: { help: true } };
const providerRequests = [
  "Can Strelva build my website?",
  "Could Strelva please build our website?",
  "Strelva, please design our website.",
  "Strelva, can you build our website?",
  "Strelva build my landing page.",
  "Will Strelva deliver our website?",
  "Please Strelva create our website.",
  "Have Strelva build our website.",
];

describe("provider-first website requests", () => {
  it.each(providerRequests)("keeps %s on provider review even when generation is available", request => {
    const plan = planWorkspaceStart(request, context);
    expect(plan).toMatchObject({ route: "help", deliveryMode: "service", request, helpRequest: request, canContinue: true });
    expect(plan.nextAction).toContain("separate acceptance");
    expect(createWorkspaceStartContinuation(plan)).toBeNull();
  });

  it.each([
    "Strelva, do not build my website.",
    "Strelva should not design our website.",
    "Strelva cannot build my website.",
    "Can Strelva show me how to build my website?",
    "Can Strelva build an internal app?",
    "Create a website myself.",
    "I do not want Strelva to build a website.",
    "Strelva, please show me how to design our website.",
  ])("does not turn %s into provider delivery", request => {
    expect(planWorkspaceStart(request, context).deliveryMode).toBeUndefined();
  });

  it("keeps a provider-first multi-part brief intact", () => {
    const request = "Strelva, please design our website and organize supplier onboarding.";
    expect(planWorkspaceStart(request, context)).toMatchObject({ deliveryMode: "service", helpRequest: request, request });
  });

  it("does not start work from a read-only workspace", () => {
    expect(planWorkspaceStart(providerRequests[0]!, { ...context, readOnly: true })).toMatchObject({ deliveryMode: "service", status: "blocked", canContinue: false });
  });

  it("keeps unavailable service intake closed", () => {
    expect(planWorkspaceStart(providerRequests[0]!, { ...context, native: { help: false } })).toMatchObject({ deliveryMode: "service", status: "blocked", canContinue: false });
  });
});
