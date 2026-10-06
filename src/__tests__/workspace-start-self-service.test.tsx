// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceStart } from "@/experience/workspace/WorkspaceStart";
import { planWorkspaceStart, selfServiceWorkspaceStartPlan, type WorkspaceStartContext } from "@/experience/workspace/workspace-start";

// The managed request's second choice (website System spec, safety batch
// follow-up): a managed client can still make the website themselves.
const managed: WorkspaceStartContext = {
  products: [{ id: "websites", availability: "available" }, { id: "managed_presence", availability: "managed" }],
  managedSites: [{ id: "site-a", title: "Business A", href: "/dashboard?tenant=site-a" }],
};

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function render(element: React.ReactNode) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(element));
  return node;
}
const button = (node: HTMLElement, label: string) => [...node.querySelectorAll("button")].find(item => item.textContent?.includes(label));

describe("make it yourself instead", () => {
  it("turns a managed website request into the self-service website plan for the same words", () => {
    const service = planWorkspaceStart("Build a new website", managed);
    expect(service.deliveryMode).toBe("service");
    const self = selfServiceWorkspaceStartPlan(service)!;
    expect(self).toMatchObject({ kind: "supported", route: "websites", productId: "websites", status: "ready", request: "Build a new website" });
    expect(self.deliveryMode).toBeUndefined();
  });
  it("offers nothing where the owner cannot make websites", () => {
    const readOnly = planWorkspaceStart("Build a new website", { ...managed, readOnly: true });
    expect(selfServiceWorkspaceStartPlan(readOnly)).toBeNull();
    const noProduct = planWorkspaceStart("Build a new website", { ...managed, products: managed.products!.filter(item => item.id !== "websites") });
    expect(selfServiceWorkspaceStartPlan(noProduct)).toBeNull();
    expect(selfServiceWorkspaceStartPlan(planWorkspaceStart("Create a staff request app.", { products: [{ id: "applications", availability: "available" }] }))).toBeNull();
  });
  it("shows the button on a managed request, switches the proposal and sends nothing", async () => {
    const onHelp = vi.fn(); const onContinue = vi.fn();
    const node = await render(createElement(WorkspaceStart, { initialRequest: "Build a new website", context: managed, onContinue, onHelp }));
    expect(node.textContent).toContain("Have Strelva build your website");
    const choice = button(node, "Make it yourself instead");
    expect(choice).toBeTruthy();
    await act(async () => choice!.click());
    expect(node.textContent).toContain("Your website");
    expect(node.textContent).not.toContain("Have Strelva build your website");
    expect(button(node, "Make it yourself instead")).toBeUndefined();
    expect(onHelp).not.toHaveBeenCalled(); expect(onContinue).not.toHaveBeenCalled();
  });
  it("hides the button where self-service is not offered", async () => {
    const node = await render(createElement(WorkspaceStart, { initialRequest: "Build a new website", context: { ...managed, products: managed.products!.filter(item => item.id !== "websites") }, onContinue: vi.fn(), onHelp: vi.fn() }));
    expect(node.textContent).toContain("Have Strelva build your website");
    expect(button(node, "Make it yourself instead")).toBeUndefined();
  });
});
