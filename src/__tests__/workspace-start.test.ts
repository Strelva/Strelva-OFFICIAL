import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceStart } from "@/experience/workspace/WorkspaceStart";
import {
  createWorkspaceStartContinuation,
  planWorkspaceStart,
  workspaceStartContinueLabel,
  type WorkspaceStartContext,
} from "@/experience/workspace/workspace-start";
import { workspaceWorkLabel } from "@/experience/workspace/work-label";

function context(overrides: Partial<WorkspaceStartContext> = {}): WorkspaceStartContext {
  return {
    products: [
      { id: "ai_visibility", name: "AI Visibility", availability: "available" },
      { id: "tracker", name: "Spreadsheet tracker", availability: "available" },
      { id: "inquiries", name: "Inquiry work", availability: "available" },
      { id: "managed_presence", name: "Managed Websites", availability: "managed" },
      { id: "applications", name: "Internal applications", availability: "available" },
      { id: "scheduling", name: "Scheduling", availability: "available" },
      { id: "investigations", name: "Ongoing checks", availability: "available" },
      { id: "operations", name: "Delegated work", availability: "available" },
    ],
    inquiryBusinesses: [{ id: "harbor", title: "Harbor Dental" }],
    managedSites: [{ id: "harbor-site", title: "Harbor Dental", href: "/preview/strelva/website" }],
    ...overrides,
  };
}

describe("workspace start planner", () => {
  it("maps a plain assessment request to an Answer shape without running work", () => {
    const plan = planWorkspaceStart("Help me see what AI understands about my business.", context());

    expect(plan).toMatchObject({ kind: "supported", status: "ready", route: "assessment", outcome: "Answer", canContinue: true });
    expect(plan.parts).toHaveLength(3);
    expect(plan.parts.map((part) => part.label)).toContain("Saved assessment");
  });

  it("suggests a matching tracker template while keeping the native tracker flow", () => {
    const plan = planWorkspaceStart("Turn my task list into a tracker.", context({ trackerTemplates: [{ id: "task-list", label: "Task list" }, { id: "inventory", label: "Inventory" }] }));
    expect(plan.route).toBe("tracker");
    expect(plan.suggestedTemplateId).toBe("task-list");
    expect(plan.parts.every((part) => !part.optional && !part.editable)).toBe(true);
  });

  it("maps natural paraphrases to the supported native proposal", () => {
    const cases = [
      ["Build an app for staff requests", "applications"],
      ["Build a staff request app", "applications"],
      ["Help my staff request time off", "scheduling"],
      ["Keep track of overdue invoices", "tracker"],
      ["Reconcile two spreadsheets", "investigations"],
      ["Schedule follow-ups for unanswered inquiries", "scheduling"],
    ] as const;

    for (const [request, route] of cases) {
      expect(planWorkspaceStart(request, context()), request).toMatchObject({ kind: "supported", status: "ready", route });
    }
  });

  it("names the native destination in each horizontal continuation", () => {
    for (const [request, label] of [
      ["Build a staff request app", "Prepare application"],
      ["Help my staff request time off", "Open scheduling"],
      ["Reconcile two spreadsheets", "Open ongoing checks"],
      ["Delegate these approved steps", "Open ongoing work"],
    ] as const) {
      const plan = planWorkspaceStart(request, context());
      expect(workspaceStartContinueLabel(plan)).toBe(label);
    }
  });

  it("names saved horizontal work by the surface that can reopen it", () => {
    expect(workspaceWorkLabel({ productId: "applications", resourceKind: "application" })).toBe("Application");
    expect(workspaceWorkLabel({ productId: "scheduling", resourceKind: "schedule" })).toBe("Schedule");
    expect(workspaceWorkLabel({ productId: "investigations", resourceKind: "investigation" })).toBe("Ongoing check");
    expect(workspaceWorkLabel({ productId: "operations", resourceKind: "responsibility" })).toBe("Delegated work");
    expect(workspaceWorkLabel({ productId: "future", resourceKind: "result" })).toBe("Saved work · view unavailable");
  });

  it("keeps a private document request on its reviewable path", () => {
    const plan = planWorkspaceStart("Draft a private procedure for opening the shop.", context({ products: [...context().products!, { id: "documents", name: "Documents", availability: "available" }] }));
    expect(plan).toMatchObject({ route: "document", productId: "documents", status: "ready", canContinue: true });
    expect(createWorkspaceStartContinuation(plan)).toMatchObject({ route: "document", request: "Draft a private procedure for opening the shop." });
  });

  it("requires an explicit Business when inquiry work has multiple scopes", () => {
    const plan = planWorkspaceStart("Keep customer inquiries moving.", context({ inquiryBusinesses: [{ id: "one", title: "One" }, { id: "two", title: "Two" }] }));
    expect(plan).toMatchObject({ route: "inquiries", needsSelection: "business", canContinue: false });
    expect(createWorkspaceStartContinuation(plan)).toBeNull();
    expect(createWorkspaceStartContinuation(plan, plan.selectedPartIds, { businessId: "two" })).toMatchObject({ businessId: "two", route: "inquiries" });
  });

  it("blocks new work in a delegated read-only workspace", () => {
    const plan = planWorkspaceStart("Turn this CSV into a tracker.", context({ readOnly: true }));
    expect(plan).toMatchObject({ route: "tracker", status: "blocked", canContinue: false });
    expect(plan.reason).toContain("read-only");
    expect(createWorkspaceStartContinuation(plan)).toBeNull();
  });

  it("reports unavailable products without claiming a flow started", () => {
    const plan = planWorkspaceStart("Turn this spreadsheet into a tracker.", context({ products: [{ id: "tracker", name: "Spreadsheet tracker", availability: "release_gated" }] }));
    expect(plan).toMatchObject({ route: "tracker", status: "blocked", canContinue: false });
    expect(plan.reason).toContain("not available");
  });

  it("keeps inquiry and website scope failures explicit", () => {
    const noBusiness = planWorkspaceStart("Handle our customer inquiries.", context({ inquiryBusinesses: [] }));
    expect(noBusiness.reason).toContain("No business scope");

    const unavailableSite = planWorkspaceStart("Improve my website.", context({ managedWorkUnavailable: true, managedSites: [] }));
    expect(unavailableSite).toMatchObject({ route: "website", status: "blocked" });
    expect(unavailableSite.reason).toContain("temporarily unavailable");
  });

  it("routes unknown intent to scoped help", () => {
    const plan = planWorkspaceStart("Automate everything for my company.", context());
    expect(plan).toMatchObject({ kind: "help", status: "help", route: "help", canContinue: true });
    expect(plan.summary).not.toContain("general AI");
  });

  it("does not offer plan creation from an unknown request in a read-only workspace", () => {
    const plan = planWorkspaceStart("Automate everything for my company.", context({ readOnly: true }));
    expect(plan).toMatchObject({ kind: "help", status: "blocked", route: "help", canContinue: false });
    expect(plan.reason).toContain("read-only");
  });

  it("renders one request box with concrete examples before any proposal", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceStart, {
      context: context(),
      onContinue: () => undefined,
      onHelp: () => undefined,
    }));
    expect(html).toContain("data-workspace-start");
    expect(html).toContain("What should Strelva try?");
    expect(html).toContain("Show me the shape");
    expect(html).toContain("Handle customer inquiries");
    expect(html).toContain("Turn a file into a tracker");
    expect(html).toContain("Check a business");
    expect(html).toContain("Improve my website");
    expect(html).not.toContain("general AI task");
  });
});
