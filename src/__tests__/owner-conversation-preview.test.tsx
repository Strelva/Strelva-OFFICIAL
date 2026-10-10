// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerConversationPreview } from "@/experience/workspace/preview/OwnerConversationPreview";
import { OWNER_CONVERSATION_FRAMES, ownerConversationTransport } from "@/experience/workspace/preview/owner-conversation-fixture";

let root: Root | undefined;
let node: HTMLDivElement;
beforeEach(() => { Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() }); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.append(node); });
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; node.remove(); vi.unstubAllGlobals(); });

describe("fictional owner conversation canon", () => {
  it.each(OWNER_CONVERSATION_FRAMES)("renders %s through Ask Strelva and labels the fixture boundary", frame => {
    const html = renderToStaticMarkup(createElement(OwnerConversationPreview, { frame, state: "ready" }));
    expect(html).toContain("Fictional conversation and results");
    expect(html).toContain("Saying yes here never approves anything");
    expect(html).not.toMatch(/\b(AI|agent|automation|workflow|task)\b/);
  });

  it.each(["empty", "loading", "error", "permission"] as const)("renders the %s boundary explicitly", state => {
    const html = renderToStaticMarkup(createElement(OwnerConversationPreview, { frame: "ABt1D", state }));
    expect(html).toContain(state === "empty" ? "Ask in your own words" : state === "loading" ? "Loading result content" : state === "error" ? "This saved result could not be read" : "You can’t ask or approve");
    if (state === "permission") expect(html).toMatch(/<textarea[^>]*disabled/);
  });

  it("embeds only the existing sandboxed fictional site", () => {
    const html = renderToStaticMarkup(createElement(OwnerConversationPreview, { frame: "Y2Tn3F", state: "ready" }));
    expect(html).toContain('sandbox=""');
    expect(html).toContain("/preview/strelva/owner-website-preview?fixture=1");
    expect(html).toContain("comparison changes the fixture ledger only");
  });

  it("keeps typed yes separate from the exact fixture decision", async () => {
    const outsideFetch = vi.fn(() => { throw new Error("Fixture escaped to the network"); });
    vi.stubGlobal("fetch", outsideFetch);
    root = createRoot(node);
    await act(async () => root!.render(createElement(OwnerConversationPreview, { frame: "HQ5yA", state: "ready" })));
    const textarea = node.querySelector<HTMLTextAreaElement>('textarea[aria-label^="Ask Strelva about"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "yes, publish it");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { textarea.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(node.textContent).toContain("Saying yes here doesn't publish or approve anything");
    const recovery = [...node.querySelectorAll<HTMLAnchorElement>("a")].filter(link => ["Open Needs you", "Ask for help"].includes(link.textContent ?? ""));
    expect(recovery.map(link => link.getAttribute("href"))).toEqual(["/preview/strelva/owner-decision", "/preview/strelva/owner-conversation?frame=YsBMM"]);
    expect(node.textContent).not.toContain("Accepted in this preview. No live website changed.");
    const decision = [...node.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Publish fixture"))!;
    await act(async () => { decision.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true })); });
    expect(node.textContent).toContain("Accepted in this preview. No live website changed.");
    expect(outsideFetch).not.toHaveBeenCalled();
  });

  it("keeps form input and fact decisions local", async () => {
    root = createRoot(node);
    await act(async () => root!.render(createElement(OwnerConversationPreview, { frame: "T8pknG", state: "ready" })));
    const input = node.querySelector<HTMLInputElement>('input[placeholder="Full name"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Preview visitor");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input.value).toBe("Preview visitor");
    const make = [...node.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Make it"))!;
    await act(async () => { make.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true })); });
    expect(node.textContent).toContain("No System or record was saved.");
    await act(async () => root!.render(createElement(OwnerConversationPreview, { frame: "ABt1D", state: "ready" })));
    const confirm = [...node.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.startsWith("Confirm"))!;
    await act(async () => { confirm.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true })); });
    expect(node.textContent).toContain("Confirmed in this preview. Nothing published.");
  });

  it("never calls an external transport, including error and permission states", async () => {
    const outsideFetch = vi.fn(() => { throw new Error("Not allowed"); });
    vi.stubGlobal("fetch", outsideFetch);
    for (const state of ["ready", "error", "permission"] as const) {
      const response = await ownerConversationTransport(state)("/api/workspace/ask", { method: "POST", body: JSON.stringify({ messages: [{ content: "yes" }] }) });
      expect(response.status).toBe(state === "ready" ? 200 : state === "error" ? 503 : 403);
    }
    expect(outsideFetch).not.toHaveBeenCalled();
  });
});
