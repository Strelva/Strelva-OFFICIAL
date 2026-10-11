// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceBusinessSwitcher } from "@/experience/workspace/WorkspaceBusinessSwitcher";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";
const rootNodes: Array<{ node: HTMLDivElement; root: ReturnType<typeof createRoot> }> = [];
afterEach(async () => { for (const { node, root } of rootNodes.splice(0)) { await act(async () => root.unmount()); node.remove(); } vi.unstubAllGlobals(); });
it("groups agency/client/business scopes and returns keyboard focus on Escape", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const snapshot: WorkspaceSnapshot = { actor: { email: "staff@example.test", localPreview: true }, workspaceId: "client", workspaces: [
    { id: "agency", name: "North Studio", kind: "agency", role: "owner" },
    { id: "client", name: "Harbor Dental", kind: "customer", access: "provider_seat", role: "admin" },
    { id: "owned", name: "Own business", kind: "customer", role: "owner" },
  ], work: [], handoffs: [], delegations: [], products: [] };
  const node = document.createElement("div"); document.body.appendChild(node); const root = createRoot(node); rootNodes.push({ node, root });
  const onWorkspace = vi.fn();
  await act(async () => root.render(createElement(WorkspaceBusinessSwitcher, { snapshot, busy: false, onWorkspace, onNavigate: vi.fn() })));
  const trigger = node.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
  expect(trigger.textContent).toContain("North Studio / Harbor Dental");
  await act(async () => trigger.click());
  const menu = node.querySelector('#owner-business-menu')!;
  expect(menu.textContent).toContain("Your agency"); expect(menu.textContent).toContain("Clients"); expect(menu.textContent).toContain("Your business");
  expect(menu.textContent).not.toContain("Your businesses");
  await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  expect(node.querySelector('#owner-business-menu')).toBeNull(); expect(document.activeElement).toBe(trigger);
  await act(async () => trigger.click());
  await act(async () => [...node.querySelectorAll<HTMLButtonElement>('#owner-business-menu button')].find(button => button.textContent?.includes("North Studio"))!.click());
  expect(onWorkspace).toHaveBeenCalledExactlyOnceWith("agency"); expect(node.querySelector('#owner-business-menu')).toBeNull();
});
