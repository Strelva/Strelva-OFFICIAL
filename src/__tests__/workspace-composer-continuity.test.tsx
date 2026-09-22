// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceStart } from "@/experience/workspace/WorkspaceStart";
import { WorkspaceComposer } from "@/experience/workspace/WorkspaceComposer";

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function render(element: React.ReactNode) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(element));
  return node;
}
async function edit(node: HTMLElement, value: string) {
  const field = node.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
describe("request proposal continuity", () => {
  it("removes a stale proposal immediately when the request changes", async () => {
    const onContinue = vi.fn();
    const node = await render(createElement(WorkspaceStart, {
      initialRequest: "Create a staff request app.",
      context: { products: [{ id: "applications", availability: "available" }, { id: "onboarding", availability: "available" }], native: { applications: true, onboarding: true } },
      onContinue, onHelp: vi.fn(),
    }));
    expect(node.textContent).toContain("A private working application");
    await edit(node, "Organize supplier onboarding requirements.");
    expect(node.textContent).not.toContain("A private working application");
    expect(onContinue).not.toHaveBeenCalled();
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(node.textContent).toContain("Onboarding requirements");
    expect(node.querySelector("textarea")?.value).toBe("Organize supplier onboarding requirements.");
  });
  it("does not submit while an input method is composing", async () => {
    const submit = vi.fn();
    const node = await render(createElement(WorkspaceComposer, { initialRequest: "Private request", onSubmit: submit }));
    await act(async () => node.querySelector("textarea")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true })));
    expect(submit).not.toHaveBeenCalled();
  });
});
