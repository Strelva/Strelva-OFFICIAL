// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemVersionManagement } from "@/experience/systems/SystemVersionManagement";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
const workspaceId = crypto.randomUUID(), systemId = crypto.randomUUID(), versionId = crypto.randomUUID();
const roots: ReturnType<typeof createRoot>[] = [];
const view = { workspaceId, systemId, versionId, rowRevision: 3, canManage: true, workingDefinition: { title: "Client tool" },
  releases: [{ number: 1, releasedAt: "2026-10-01" }], overrides: [], bindings: [], bindingChoices: [] };
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function render(request: typeof fetch, readOnly = false) {
  const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(SystemVersionManagement, { workspaceId, systemId, versionId, readOnly }))));
  return node;
}
function prepare(node: HTMLElement) { return [...node.querySelectorAll("button")].find(button => button.textContent === "Prepare this draft for release")!; }
describe("Version draft management acknowledgment", () => {
  it.each([
    ["Save local value", "override"], ["Bind account", "bind"], ["Restore into draft", "restore"],
  ])("recovers focus after %s without keeping the old controls during refresh", async (label, action) => {
    const connectionId = crypto.randomUUID();
    const current = { ...view, bindingChoices: [{ kind: "booking_calendar", connectionId, label: "Business calendar" }] };
    let reads = 0; let finish!: (response: Response) => void;
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === "POST") return Response.json({ outcome: "saved", rowRevision: 4, receipt: null });
      if (++reads === 1) return Response.json(current);
      return new Promise<Response>(resolve => { finish = resolve; });
    });
    const node = await render(request);
    const fields = action === "override" ? [node.querySelector<HTMLInputElement>('input')!, "title"] as const
      : [node.querySelectorAll<HTMLSelectElement>("select")[action === "bind" ? 0 : 1]!, action === "bind" ? connectionId : "1"] as const;
    const field = fields[0]; field.closest("details")!.open = true;
    await act(async () => {
      Object.getOwnPropertyDescriptor(field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(field, fields[1]);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    });
    const button = [...node.querySelectorAll("button")].find(button => button.textContent === label)!;
    button.focus(); await act(async () => button.click());
    expect(document.activeElement?.textContent).toBe("Version draft"); expect(prepare(node)).toBeUndefined();
    const post = request.mock.calls.find(([,init]) => init?.method === "POST")![1]!;
    expect(JSON.parse(String(post.body))).toMatchObject({ workspaceId, systemId, versionId, rowRevision: 3, action });
    await act(async () => finish(Response.json({ ...current, rowRevision: 4 })));
    expect(document.activeElement?.textContent).toContain("draft is saved"); expect(prepare(node).disabled).toBe(false);
  });
  it("keeps useful keyboard focus while a saved draft refreshes and then reports lost management authority", async () => {
    let reads = 0; let finish!: (response: Response) => void;
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === "POST") return Response.json({ outcome: "prepared", rowRevision: 3, receipt: null });
      if (++reads === 1) return Response.json(view);
      return new Promise<Response>(resolve => { finish = resolve; });
    });
    const node = await render(request); const action = prepare(node); action.focus();
    await act(async () => action.click());
    expect(prepare(node)).toBeUndefined();
    expect(document.activeElement?.textContent).toBe("Version draft");
    await act(async () => finish(Response.json({ ...view, canManage: false })));
    expect(prepare(node)).toBeUndefined();
    expect(document.activeElement?.textContent).toContain("An owner or admin can change");
    expect(node.textContent).toContain("An owner or admin can change");
  });
  it("focuses refresh refusal and keeps stale draft controls absent through explicit reload recovery", async () => {
    let reads = 0; let finish!: (response: Response) => void;
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === "POST") return Response.json({ outcome: "prepared", rowRevision: 3, receipt: null });
      if (++reads === 1) return Response.json(view);
      return new Promise<Response>(resolve => { finish = resolve; });
    });
    const node = await render(request); prepare(node).focus(); await act(async () => prepare(node).click());
    await act(async () => finish(Response.json({ error: "Current draft is unavailable" }, { status: 503 })));
    expect(document.activeElement).toBe(node.querySelector('[role="alert"]')); expect(prepare(node)).toBeUndefined();
    const reload = [...node.querySelectorAll("button")].find(button => button.textContent === "Reload the draft")!;
    reload.focus(); await act(async () => reload.click());
    expect(document.activeElement?.textContent).toBe("Version draft"); expect(prepare(node)).toBeUndefined();
    await act(async () => finish(Response.json({ ...view, canManage: false })));
    expect(document.activeElement?.textContent).toContain("An owner or admin can change"); expect(prepare(node)).toBeUndefined();
  });
  it("focuses an uncertain write error without restoring or resubmitting stale authority", async () => {
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === "POST") throw new Error("Reply lost. Reload the current draft.");
      return Response.json(view);
    });
    const node = await render(request); prepare(node).focus(); await act(async () => prepare(node).click());
    expect(document.activeElement).toBe(node.querySelector('[role="alert"]'));
    expect(prepare(node).disabled).toBe(true); await act(async () => prepare(node).click());
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("does not expose a stale draft while recovering from an uncertain write", async () => {
    let reads = 0;
    let finish!: (response: Response) => void;
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === "POST") throw new Error("Reply lost");
      if (++reads === 1) return Response.json(view);
      return new Promise<Response>(resolve => { finish = resolve; });
    });
    const node = await render(request); await act(async () => prepare(node).click());
    expect(prepare(node).disabled).toBe(true);
    const reload = [...node.querySelectorAll("button")].find(button => button.textContent === "Reload the draft")!;
    await act(async () => reload.click());
    expect(node.textContent).toContain("Reading the Version’s draft");
    expect(prepare(node)).toBeUndefined();
    await act(async () => finish(Response.json({ ...view, rowRevision: 4, canManage: false })));
    expect(prepare(node)).toBeUndefined();
    expect(node.textContent).toContain("An owner or admin can change");
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("keeps loading, error and read-only states honest", async () => {
    const loading = await render(vi.fn(() => new Promise<Response>(() => undefined)));
    expect(loading.querySelector('[role="status"]')?.textContent).toContain("Reading the Version"); expect(prepare(loading)).toBeUndefined();
    const error = await render(vi.fn(async () => Response.json({ error: "Draft is unavailable" }, { status: 503 })));
    expect(error.querySelector('[role="alert"]')?.textContent).toBe("Draft is unavailable");
    expect(error.textContent).toContain("Reload the draft");
    const request = vi.fn<typeof fetch>(async () => Response.json(view));
    const readOnly = await render(request, true);
    expect(readOnly.textContent).toContain("An owner or admin can change"); expect(prepare(readOnly)).toBeUndefined(); expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not claim an owner decision when the draft already matches the live release", async () => {
    const request = vi.fn<typeof fetch>(async (_input, init) => Response.json(init?.method === "POST" ? { outcome: "prepared", rowRevision: 3, receipt: null } : view));
    const node = await render(request); await act(async () => prepare(node).click());
    expect(node.textContent).toContain("No release decision was needed"); expect(node.textContent).not.toContain("The release decision is in Needs you");
  });
  it("accepts only the current business Version's release receipt", async () => {
    const receipt = { receiptId: crypto.randomUUID(), decisionId: crypto.randomUUID(), workspaceId, versionId, rowRevision: 3 };
    const request = vi.fn<typeof fetch>(async (_input, init) => Response.json(init?.method === "POST" ? { outcome: "prepared", rowRevision: 3, receipt: { ...receipt, workspaceId: crypto.randomUUID() } } : view));
    const node = await render(request); await act(async () => prepare(node).click());
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("receipt could not be confirmed"); expect(node.textContent).not.toContain("The release decision is in Needs you");
    expect(prepare(node).disabled).toBe(true);
  });
  it("refuses a changed row acknowledgment and malformed receipt rather than announcing success", async () => {
    for (const result of [{ outcome: "prepared", rowRevision: 4, receipt: null }, { outcome: "prepared", rowRevision: 3, receipt: {} }]) {
      const request = vi.fn<typeof fetch>(async (_input, init) => Response.json(init?.method === "POST" ? result : view));
      const node = await render(request); await act(async () => prepare(node).click());
      expect(node.querySelector('[role="alert"]')).not.toBeNull(); expect(node.textContent).not.toContain("The release decision is in Needs you");
    }
  });
});
