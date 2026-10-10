// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceOngoing } from "@/experience/workspace/WorkspaceOngoing";
import { InquiryRunning } from "@/experience/workspace/InquiryRunning";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function mount(request: typeof fetch, workspaceId = "one", enabled = true) {
  const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root);
  const draw = async (workspace: string, on = true) => act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(InquiryRunning, { workspaceId: workspace, enabled: on }))));
  await draw(workspaceId, enabled); return { node, draw };
}
const row = { id: "current", title: "Handle inquiries from Juniper", sentence: "Strelva reviews ordinary replies. Policy hours apply.", status: "active" };
describe("Running inquiry policy read", () => {
  it("the existing Running surface includes inquiry policies alongside unchanged operational work", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => String(input).includes("/api/operations")
      ? Response.json({ proof: { cards: [], verdict: "No observed responsibility receipts." }, state: { businessId: "one", providerWorkspaceId: null, canSetCadence: false, cadence: "monthly", mandates: [] } }) : Response.json({ details: [{ running: [row] }] }));
    vi.stubGlobal("fetch", request);
    const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root);
    const props = { workspaceId: "one", sources: [], selectedWork: null, selectedStandingId: null, selectedAssignmentId: null,
      creatingStanding: false, readOnly: true, onCreatingStandingChange: vi.fn(), onOpenStanding: vi.fn(), onSaved: vi.fn() };
    await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(WorkspaceOngoing, { ...props, inquiriesEnabled: true }))));
    await vi.waitFor(() => expect(node.textContent).toContain("Juniper"));
    expect(node.textContent).toContain("Saved checks that can run again");
    await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(WorkspaceOngoing, { ...props, inquiriesEnabled: false }))));
    expect(node.textContent).not.toContain("Juniper"); expect(node.textContent).toContain("Saved checks that can run again");
    expect(request.mock.calls.filter(([input]) => String(input).includes("inquiries/system"))).toHaveLength(1);
  });
  it("is absent and makes no request when off, then deduplicates the same canonical policy", async () => {
    const request = vi.fn(async () => Response.json({ details: [{ running: [row] }, { running: [row] }] }));
    const { node, draw } = await mount(request, "one", false); expect(node.textContent).toBe(""); expect(request).not.toHaveBeenCalled();
    await draw("one"); await vi.waitFor(() => expect(node.textContent).toContain("Active policy"));
    expect(node.querySelectorAll("li")).toHaveLength(1); expect(request.mock.calls).toHaveLength(1);
  });
  it("clears old sentences immediately during switch loading and shows an honest error without replacing other work", async () => {
    let resolve!: (value: Response) => void;
    const request = vi.fn(async (input: RequestInfo | URL) => String(input).includes("workspaceId=one")
      ? Response.json({ details: [{ running: [row] }] }) : new Promise<Response>(done => { resolve = done; }));
    const { node, draw } = await mount(request); await vi.waitFor(() => expect(node.textContent).toContain("Juniper"));
    await draw("two"); expect(node.textContent).toContain("Checking inquiry reply policies"); expect(node.textContent).not.toContain("Juniper");
    await act(async () => resolve(Response.json({ error: "Storage unavailable" }, { status: 503 })));
    await vi.waitFor(() => expect(node.textContent).toContain("couldn’t load"));
    expect(node.textContent).toContain("Other running work is still available");
    expect(node.querySelector("button")?.textContent).toBe("Retry inquiry policies");
  });
  it("discards a previous business's response after switching and cannot restore its private sentence", async () => {
    let finish!: (value: Response) => void;
    const request = vi.fn(async (input: RequestInfo | URL) => String(input).includes("workspaceId=one")
      ? new Promise<Response>(done => { finish = done; }) : Response.json({ details: [] }));
    const { node, draw } = await mount(request); await draw("two");
    await vi.waitFor(() => expect(node.textContent).toBe(""));
    await act(async () => finish(Response.json({ details: [{ running: [row] }] })));
    expect(node.textContent).toBe(""); expect(node.textContent).not.toContain("Juniper");
  });
  it.each([200, 403, 503])("empty, denied and disabled reads stay quiet (%s)", async status => {
    const request = vi.fn(async () => Response.json(status === 200 ? { details: [] } : { error: "Inquiries aren't open for this business." }, { status }));
    const { node } = await mount(request); await vi.waitFor(() => expect(node.textContent).toBe(""));
  });
});
