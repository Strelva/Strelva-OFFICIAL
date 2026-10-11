// @vitest-environment jsdom
import { act, createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StComposerBar, StHold, StRow } from "@/components/ui/strelva/Kit";
import { WorkspaceComposer } from "@/experience/workspace/WorkspaceComposer";
import { WorkspaceBusinessSwitcher } from "@/experience/workspace/WorkspaceBusinessSwitcher";
import { writeRequestDraft } from "@/experience/workspace/request-draft";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";
import { BusinessHome } from "@/experience/workspace/BusinessHome";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function render(element: React.ReactNode) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root); await act(async () => root.render(element)); return node;
}

describe("owner paper controls", () => {
  it("returns from receipts through phone Home and keeps failed request reads distinct from an empty queue", async () => {
    const snapshot: WorkspaceSnapshot = { actor: { email: "owner@example.test", localPreview: true }, work: [], products: [], handoffs: [], delegations: [], workspaceId: "one", workspaces: [{ id: "one", kind: "customer", name: "First business", role: "owner" }], releases: { systems: true, needsYou: true } };
    const request = vi.fn<typeof fetch>(async () => Response.json({ error: "The saved records could not be read." }, { status: 503 }));
    vi.stubGlobal("fetch", request);
    const navigate = vi.fn();
    const node = await render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(BusinessHome, { snapshot, sites: [], unassignedSites: [], siteAssignmentsKnown: true, offerings: { status: "unavailable", reason: "Unavailable" }, busy: false, onOpen: vi.fn(), onStart: vi.fn(), onNavigate: navigate, onWorkspace: vi.fn(), onOfferings: vi.fn(), accountHref: "/workspace/account", signOut: createElement("span", null, "Local test"), systemsReleased: true })));
    expect(node.textContent).toContain("Requests could not be checked.");
    expect(node.textContent).not.toContain("Nothing is in progress.");
    const receipts = [...node.querySelectorAll("button")].find(button => button.textContent === "All receipts")!;
    await act(async () => receipts.click());
    expect(node.querySelector("#business-start-title")?.textContent).toBe("What changed");
    const home = [...node.querySelectorAll('nav[aria-label="Phone workspace navigation"] button')].find(button => button.textContent === "Home") as HTMLButtonElement;
    await act(async () => home.click());
    expect(node.querySelector("#business-start-title")?.textContent).toBe("First business");
    expect(navigate).toHaveBeenCalledWith("home");
  });

  it("opens an ordinary system row in place while preserving modified link navigation", async () => {
    const open = vi.fn();
    const node = await render(createElement("ul", null, createElement(StRow, { title: "Website", href: "/workspace?view=system&systemId=website", onClick: open })));
    const link = node.querySelector("a")!;
    const ordinary = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => link.dispatchEvent(ordinary));
    expect(ordinary.defaultPrevented).toBe(true); expect(open).toHaveBeenCalledTimes(1);
    const modified = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    await act(async () => link.dispatchEvent(modified));
    expect(modified.defaultPrevented).toBe(false); expect(open).toHaveBeenCalledTimes(1);
  });

  it("restores the owner dock draft and keeps a failed send available to retry", async () => {
    writeRequestDraft(sessionStorage, "owner-draft", "Keep my original words");
    const submit = vi.fn().mockRejectedValue(new Error("The ask could not be opened."));
    const node = await render(createElement(WorkspaceComposer, { tone: "dock", draftKey: "owner-draft", onSubmit: submit }));
    const input = node.querySelector("textarea")!;
    expect(input.value).toBe("Keep my original words");
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(submit).toHaveBeenCalledWith("Keep my original words");
    expect(input.value).toBe("Keep my original words");
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("The ask could not be opened.");
  });

  it("keeps multiline and IME entry from sending and exposes the actual input ref", async () => {
    const onSubmit = vi.fn(); const ref = createRef<HTMLTextAreaElement>();
    const node = await render(createElement(StComposerBar, { multiline: true, textareaRef: ref, maxLength: 20000, placeholder: "Ask", value: "yes", onChange: vi.fn(), onSubmit }));
    expect(ref.current).toBe(node.querySelector("textarea"));
    await act(async () => ref.current!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true })));
    await act(async () => ref.current!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true })));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(ref.current!.maxLength).toBe(20000);
  });

  it("does not approve on a click or after focus leaves a hold", async () => {
    const accept = vi.fn(); const frames = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(1, callback); return 1; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const node = await render(createElement(StHold, { label: "Hold to accept", "aria-label": "Accept the exact scope", onAccept: accept }));
    const button = node.querySelector("button")!;
    await act(async () => button.click()); expect(accept).not.toHaveBeenCalled();
    await act(async () => button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(frames.size).toBe(1);
    await act(async () => button.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(frames.size).toBe(0); expect(accept).not.toHaveBeenCalled();
    await act(async () => button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true })));
    expect(accept).toHaveBeenCalledTimes(1);
    await act(async () => button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, repeat: true, bubbles: true })));
    expect(accept).toHaveBeenCalledTimes(1);
  });

  it("offers only supplied memberships and restores switcher focus on Escape", async () => {
    const onWorkspace = vi.fn();
    const snapshot: WorkspaceSnapshot = { actor: { email: "owner@example.test", localPreview: true }, work: [], products: [], handoffs: [], delegations: [], workspaceId: "one", workspaces: [{ id: "one", kind: "customer", name: "First business", role: "owner" }, { id: "two", kind: "customer", name: "Shared business", access: "delegated_read" }] };
    const node = await render(createElement(WorkspaceBusinessSwitcher, { snapshot, busy: false, onWorkspace, onNavigate: vi.fn() }));
    const trigger = node.querySelector("button")!;
    await act(async () => trigger.click());
    expect(node.textContent).toContain("Read-only");
    const shared = Array.from(node.querySelectorAll("button")).find(button => button.textContent?.includes("Shared business"))!;
    await act(async () => shared.click()); expect(onWorkspace).toHaveBeenCalledWith("two");
    expect(node.querySelector('[aria-label="Your businesses"]')).toBeNull();
    await act(async () => trigger.click());
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.activeElement).toBe(trigger); expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
