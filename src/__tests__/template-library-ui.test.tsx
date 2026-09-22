// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceTemplateLibrary } from "@/experience/workspace/WorkspaceTemplateLibrary";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";

const workspaceId = "33333333-3333-4333-8333-333333333333";
const appId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const roots: ReturnType<typeof createRoot>[] = [];
const options = { workspaceId, actorEmail: "owner@example.com", businessName: "Studio", canCreate: true, onRequest: vi.fn() };
beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, "", "/workspace?view=products&template=staff-requests");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function render(request: typeof fetch, props = {}) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => { root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(WorkspaceTemplateLibrary, { ...options, ...props }))); await new Promise(resolve => setTimeout(resolve, 20)); });
  for (let index = 0; index < 4 && !node.textContent?.includes("Create private app"); index += 1) await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  return node;
}
function button(node: HTMLElement, text: string) { const element = [...node.querySelectorAll("button")].find(item => item.textContent?.includes(text)); expect(element).toBeDefined(); return element!; }
describe("template creation and recovery", () => {
  it("previews without requests and creates one private native app", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ id: appId, workspaceId, productId: "applications" }), { status: 201 })) as unknown as typeof fetch;
    const node = await render(request);
    expect(request).not.toHaveBeenCalled();
    expect(node.textContent).toContain("Test records are not saved or shared");
    await act(async () => { button(node, "Create private app").click(); button(node, "Create private app").click(); });
    expect(request).toHaveBeenCalledTimes(1);
    const call = vi.mocked(request).mock.calls[0]!;
    const body = JSON.parse(String(call[1]?.body));
    expect(call[0]).toBe("/api/bounded-work");
    expect(body).toMatchObject({ action: "create", productId: "applications", workspaceId, input: { title: "Staff requests" } });
    expect(body.input).not.toHaveProperty("records");
    expect(body.input).not.toHaveProperty("maintenanceOwner");
    expect(node.textContent).toContain("Your private app is ready");
    expect(node.querySelector(`a[href*="${appId}"]`)).toBeTruthy();
  });
  it("does not retry an ambiguous write and retains recovery state across reopen", async () => {
    const request = vi.fn(async () => { throw new Error("Network lost"); }) as unknown as typeof fetch;
    const first = await render(request);
    await act(async () => button(first, "Create private app").click());
    expect(button(first, "Create private app").disabled).toBe(true);
    expect(first.textContent).toContain("Check whether the app was saved");
    const second = await render(request);
    expect(button(second, "Create private app").disabled).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("retains the preview but prevents creation without native eligibility", async () => {
    const request = vi.fn() as unknown as typeof fetch;
    const node = await render(request, { canCreate: false });
    expect(button(node, "Create private app").disabled).toBe(true);
    expect(node.textContent).toContain("The preview is still available");
    expect(request).not.toHaveBeenCalled();
  });
  it("treats a mismatched business response as unconfirmed", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ id: appId, workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", productId: "applications" }), { status: 201 })) as unknown as typeof fetch;
    const node = await render(request);
    await act(async () => button(node, "Create private app").click());
    expect(node.textContent).toContain("unconfirmed result");
    expect(button(node, "Create private app").disabled).toBe(true);
  });
});
