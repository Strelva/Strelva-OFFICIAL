// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerRequestConversationPreview } from "@/experience/workspace/preview/OwnerRequestConversationPreview";
import { OwnerRequestPreview } from "@/experience/workspace/preview/OwnerRequestPreview";
import { OwnerRunningPreview, type OwnerRunningPreviewState } from "@/experience/workspace/preview/OwnerRunningPreview";

let container: HTMLDivElement;
let root: Root;
let network: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  network = vi.fn(() => { throw new Error("A fixture must not call the network."); });
  vi.stubGlobal("fetch", network);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
async function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("fictional owner canon previews", () => {
  it("keeps a reply of yes as a local draft, with no approval or message write", async () => {
    await act(async () => root.render(createElement(OwnerRequestConversationPreview)));
    expect(container.textContent).toContain("Outside this request");
    expect(container.textContent).toContain("Fictional conversation");
    await type(container.querySelector("textarea")!, "yes");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.textContent).toContain("Local reply draft prepared. Nothing was sent or approved.");
    expect(container.textContent).toContain("yes");
    expect(network).not.toHaveBeenCalled();
  });

  it("does not expose even the local reply composer to a shared viewer", async () => {
    await act(async () => root.render(createElement(OwnerRequestConversationPreview, { readOnly: true })));
    expect(container.textContent).toContain("Shared with you");
    expect(container.querySelector("form")).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });

  it("composes the actual request reader with local supporting context only for available records", async () => {
    await act(async () => root.render(createElement(OwnerRequestPreview, { state: "ready", dark: false })));
    await vi.waitFor(() => expect(container.textContent).toContain("Rebuild the Fictional Workshop website"));
    expect(container.textContent).toContain("Outside this request");
    expect(container.textContent).toContain("Scope agreed");
    await act(async () => root.render(createElement(OwnerRequestPreview, { state: "permission", dark: false })));
    await vi.waitFor(() => expect(container.textContent).toContain("This request is unavailable to your account."));
    expect(container.textContent).not.toContain("Outside this request");
    expect(container.querySelector("textarea")).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });

  it.each<OwnerRunningPreviewState>(["loading", "empty", "error", "permission"])("keeps Running %s distinct from fictional successful checks", async state => {
    await act(async () => root.render(createElement(OwnerRunningPreview, { state })));
    expect(container.textContent).not.toContain("Checked 2m ago");
    if (state === "permission") expect(container.querySelector("form")).toBeNull();
    if (state === "error") {
      expect(container.textContent).toContain("could not be loaded");
      expect(container.textContent).not.toContain("Nothing is running yet");
    }
    if (state === "loading") expect(container.querySelector('input')?.disabled).toBe(true);
    expect(network).not.toHaveBeenCalled();
  });

  it("names every running condition with words and keeps asking fixture-only", async () => {
    await act(async () => root.render(createElement(OwnerRunningPreview, { state: "ready" })));
    expect(container.querySelector('[aria-label="What Strelva keeps true"]')?.querySelectorAll("li")).toHaveLength(5);
    expect(container.textContent).toContain("Every inquiry reaches the workshop");
    expect(container.textContent).toContain("Needs a calendar");
    expect(container.textContent).toContain("Needs you");
    await type(container.querySelector('input[aria-label="Ask Strelva"]')!, "yes");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.textContent).toContain("Nothing was sent, started or approved.");
    expect(network).not.toHaveBeenCalled();
  });
});
