import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));
import { BusinessHome } from "@/experience/workspace/BusinessHome";
import { newWorkBlockedMessage } from "@/experience/workspace/workspace-exit-ui";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";

const noop = () => undefined;

function delegatedSnapshot(): WorkspaceSnapshot {
  return {
    actor: { email: "agent@harbor-agency.example", localPreview: true },
    workspaces: [{ id: "business-1", kind: "customer", name: "Alder Workshop", access: "delegated_read" }],
    workspaceId: "business-1",
    work: [],
    handoffs: [],
    delegations: [],
    products: [],
  } as WorkspaceSnapshot;
}

describe("read-only copy names the real reason", () => {
  it("tells an agency with delegated read who shared the business, not that only owners can change it", () => {
    const html = renderToStaticMarkup(createElement(BusinessHome, {
      snapshot: delegatedSnapshot(), sites: [], unassignedSites: [], siteAssignmentsKnown: true,
      offerings: { status: "unavailable", reason: "n/a" }, busy: false,
      onOpen: noop, onStart: noop, onRequest: noop, onNavigate: noop, onWorkspace: noop, onOfferings: noop, accountHref: "/workspace/account",
    }));
    expect(html).toContain("Review what was shared.");
    expect(html).toContain("Alder Workshop shared this with your agency to review.");
    expect(html).not.toContain("owners can make changes");
  });

  it.each([
    [{ exitUnavailable: true, stopped: false }, "Workspace status is temporarily unavailable, so new work is paused."],
    [{ exitUnavailable: false, stopped: true }, "Work in this workspace has stopped."],
    [{ exitUnavailable: false, stopped: false }, "Alder Workshop shared this with your agency to review. Switch to a workspace you’re a member of to create a document."],
  ])("explains why new work is blocked (%o)", (posture, message) => {
    const text = newWorkBlockedMessage({ ...posture, workspaceName: "Alder Workshop" }, "a document");
    expect(text).toBe(message);
    expect(text).not.toContain("you own");
  });
});
