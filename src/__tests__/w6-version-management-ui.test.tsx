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
