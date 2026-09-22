// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retainRequestIntent, useWorkspaceIntent, WorkspaceIntent } from "@/experience/workspace/WorkspaceIntent";
import { requestDraftKey } from "@/experience/workspace/request-draft";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { WorkPlanOutputPreview } from "@/experience/workspace/WorkPlanOutputPreview";
import type { WorkPlan } from "@/products/work-plans/contracts";

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
function IntentProbe() { return createElement("output", null, JSON.stringify(useWorkspaceIntent())); }

describe("native request restoration", () => {
  it("retains both request and intended product without crossing an actor or business", async () => {
    const key = requestDraftKey({ actorEmail: "owner@example.com", workspaceId: "one" });
    retainRequestIntent(sessionStorage, key, "Supplier onboarding. We need an insurance certificate.", "onboarding");
    const first = await render(<WorkspaceIntent draftKey={key} request=""><IntentProbe /></WorkspaceIntent>);
    expect(JSON.parse(first.node.textContent!)).toEqual({ request: "Supplier onboarding. We need an insurance certificate.", route: "onboarding", ready: true });
    for (const scope of [{ actorEmail: "other@example.com", workspaceId: "one" }, { actorEmail: "owner@example.com", workspaceId: "two" }]) {
      const other = await render(<WorkspaceIntent draftKey={requestDraftKey(scope)} request=""><IntentProbe /></WorkspaceIntent>);
      expect(JSON.parse(other.node.textContent!)).toEqual({ request: "", route: "", ready: true });
    }
  });
  it("prefers the current request and rejects corrupted or executable-looking routes", async () => {
    retainRequestIntent(sessionStorage, "draft", "old", "document");
    const current = await render(<WorkspaceIntent draftKey="draft" request="new" route="applications"><IntentProbe /></WorkspaceIntent>);
    expect(JSON.parse(current.node.textContent!)).toEqual({ request: "new", route: "applications", ready: true });
    sessionStorage.setItem("bad:continuation", JSON.stringify({ version: 1, request: "secret", route: "publish_everything" }));
    const bad = await render(<WorkspaceIntent draftKey="bad" request=""><IntentProbe /></WorkspaceIntent>);
    expect(JSON.parse(bad.node.textContent!).request).toBe("");
  });
});

const workspaceId = "22222222-2222-4222-8222-222222222222";
const planWorkId = "33333333-3333-4333-8333-333333333333";
const output = { id: "output", title: "Procedure", description: "A private document", outcome: "capability" as const, nativeOperationIds: ["create_document"], draft: { kind: "document" as const, title: "Procedure", text: "Review the request before replying." } };
const plan = { version: 1, status: "ready", userGoal: "Draft a procedure", summary: "A private procedure", proposedOutputs: [output], steps: [], neededInputs: [], supportedNativeOperations: [], estimatedCost: null, requiredDecisions: [], metadata: { revision: 1, actorId: "owner", createdBy: "owner", workspaceId, createdAt: "2026-09-22T00:00:00.000Z" } } as WorkPlan;

describe("native output retry", () => {
  it("locks attempted input and retries exactly the same request without duplicate clicks", async () => {
    let resolveFirst!: (value: Response) => void;
    const request = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveFirst = resolve; })).mockResolvedValue(new Response(JSON.stringify({ error: "Still unavailable" }), { status: 503 }));
    const { node } = await render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(WorkPlanOutputPreview, { workspaceId, planWorkId, plan, output })));
    const submit = () => [...node.querySelectorAll("button")].find(button => button.textContent?.includes("Create private document"))!;
    await act(async () => { submit().click(); submit().click(); });
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => resolveFirst(new Response(JSON.stringify({ error: "Interrupted" }), { status: 503 })));
    expect(node.querySelector("textarea")?.disabled).toBe(true);
    await act(async () => { submit().click(); });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]![1].body).toBe(request.mock.calls[1]![1].body);
    expect(node.textContent).toContain("Retry checks the same output with the same inputs.");
  });
  it("never submits when a required decision remains", async () => {
    const request = vi.fn();
    const blockedPlan = { ...plan, neededInputs: [{ id: "subject", label: "Subject", required: true }] } as WorkPlan;
    const { node } = await render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(WorkPlanOutputPreview, { workspaceId, planWorkId, plan: blockedPlan, output })));
    const submit = [...node.querySelectorAll("button")].find(button => button.textContent?.includes("Create private document"))!;
    expect(submit.disabled).toBe(true);
    await act(async () => submit.click());
    expect(request).not.toHaveBeenCalled();
  });
});
