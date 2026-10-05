// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { intentRequestFor, retainRequestIntent, useWorkspaceIntent, WorkspaceIntent } from "@/experience/workspace/WorkspaceIntent";
import { requestDraftKey } from "@/experience/workspace/request-draft";

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function render(element: ReturnType<typeof createElement>) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => { root.render(element); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  return { node, root };
}

const key = requestDraftKey({ actorEmail: "owner@example.com", workspaceId: "business-1" });

function PlanProbe() { return createElement("output", null, intentRequestFor(useWorkspaceIntent(), "plan") ?? "none"); }

describe("routed request after reload", () => {
  it("opens the work plan with a request routed to applications", async () => {
    // Choosing Applications on Start stores route "applications" and opens the plan view.
    retainRequestIntent(sessionStorage, key, "A booking app for our two chairs.", "applications");
    const { node } = await render(<WorkspaceIntent draftKey={key} request=""><PlanProbe /></WorkspaceIntent>);
    expect(node.textContent).toBe("A booking app for our two chairs.");
  });

  it("keeps each route to its own product", () => {
    const intent = { request: "Organize supplier onboarding", route: "onboarding", ready: true };
    expect(intentRequestFor(intent, "onboarding")).toBe("Organize supplier onboarding");
    expect(intentRequestFor(intent, "plan")).toBeUndefined();
    expect(intentRequestFor(intent, "document")).toBeUndefined();
    expect(intentRequestFor({ ...intent, route: "plan" }, "plan")).toBe("Organize supplier onboarding");
    expect(intentRequestFor({ ...intent, route: "applications" }, "applications")).toBeUndefined();
  });
});
