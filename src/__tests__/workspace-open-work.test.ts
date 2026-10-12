import { describe, expect, it } from "vitest";
import { NO_OPEN_WORK, leaveWork, startContinuation, startAsk, type OpenWorkContext } from "@/experience/workspace/open-work";
import type { WorkspaceStartContinuation } from "@/experience/workspace/workspace-start";

const continuation = (route: WorkspaceStartContinuation["route"], request = "Organize supplier onboarding"): WorkspaceStartContinuation => ({ route, request, includedPartIds: [] });

/** Everything the old per-slot resets could leave behind. */
const stale: OpenWorkContext = {
  missingWork: true,
  standingId: "11111111-1111-4111-8111-111111111111",
  assignmentId: "22222222-2222-4222-8222-222222222222",
  standingCreating: true,
  inquiryTenantId: "harbor",
  showAssessment: true,
  start: { view: "onboarding", request: "Old onboarding request" },
};

describe("open work context", () => {
  it("leaving the current work clears every slot at once", () => {
    expect(Object.values(NO_OPEN_WORK).every(value => value === null || value === false)).toBe(true);
    expect(leaveWork()).toEqual(NO_OPEN_WORK);
  });

  it("switching workspace, then starting any product, carries no context from before", () => {
    const starts: Array<Partial<OpenWorkContext>> = [
      {},
      { showAssessment: true, start: { view: "work", continuation: continuation("assessment") } },
      { inquiryTenantId: "lake", start: { view: "inquiries", continuation: continuation("inquiries") } },
      { start: { view: "tracker", continuation: continuation("tracker") } },
      { start: { view: "document", continuation: continuation("document") } },
      { start: { view: "plan", request: "Plan it" } },
      { start: { view: "websites", request: "A new site" } },
      { standingId: "33333333-3333-4333-8333-333333333333" },
    ];
    let open = stale;
    for (const overrides of starts) {
      open = leaveWork(); // switch workspace
      open = leaveWork(overrides); // start the next product
      for (const key of Object.keys(NO_OPEN_WORK) as Array<keyof OpenWorkContext>) {
        expect(open[key]).toEqual(key in overrides ? overrides[key] : NO_OPEN_WORK[key]);
      }
      expect(startAsk(open, "onboarding")).toBeUndefined();
    }
  });

  it("exposes a start only to the view it was started for", () => {
    const tracker = leaveWork({ start: { view: "tracker", continuation: continuation("tracker") } });
    expect(startContinuation(tracker, "tracker", "tracker")?.route).toBe("tracker");
    expect(startContinuation(tracker, "document", "document")).toBeNull();
    expect(startContinuation(tracker, "work", "assessment")).toBeNull();
    const websites = leaveWork({ start: { view: "websites", request: "A new site" } });
    expect(startAsk(websites, "websites")).toBe("A new site");
    expect(startAsk(websites, "scheduling")).toBeUndefined();
    expect(startAsk(websites, "plan")).toBeUndefined();
  });
});
