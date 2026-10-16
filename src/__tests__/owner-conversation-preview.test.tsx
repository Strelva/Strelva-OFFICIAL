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
    // XA-5: the fixture boundary says controls change this preview only; a typed yes is answered in the thread (below).
    expect(html).toContain("Controls change this preview only");
    expect(html).not.toMatch(/\b(AI|agent|automation|workflow|task)\b/);
  });

  it.each(["empty", "loading", "error", "permission"] as const)("renders the %s boundary explicitly", state => {
    const html = renderToStaticMarkup(createElement(OwnerConversationPreview, { frame: "ABt1D", state }));
    expect(html).toContain(state === "empty" ? "What should change for Fictional Firm?" : state === "loading" ? "Loading result content" : state === "error" ? "This saved result could not be read" : "You can’t ask or approve");
    if (state === "permission") expect(html).toMatch(/<textarea[^>]*disabled/);
  });

  it("embeds a sandboxed static fictional comparison without fetching a review route", () => {
    const html = renderToStaticMarkup(createElement(OwnerConversationPreview, { frame: "Y2Tn3F", state: "ready" }));
    expect(html).toContain('sandbox=""');
    expect(html).toContain("srcDoc=");
    expect(html).not.toContain("/preview/strelva/owner-website-preview?fixture=1");
    expect(html).toContain("Half-day session");
    expect(html).toContain("comparison changes this preview only");
  });

  it("changes actual website copy with Before, After, Undo and reapply", async () => {
    const outsideFetch = vi.fn(() => { throw new Error("Fixture escaped to the network"); });
    vi.stubGlobal("fetch", outsideFetch);
    root = createRoot(node);
    await act(async () => root!.render(createElement(OwnerConversationPreview, { frame: "Y2Tn3F", state: "ready" })));
    const iframe = () => node.querySelector<HTMLIFrameElement>("iframe")!;
    const click = async (label: string) => {
      const button = [...node.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === label)!;
      await act(async () => button.click());
    };
    expect(iframe().srcdoc).toContain("Half-day session");
    await click("Before");
    expect(iframe().srcdoc).toContain("Contact the firm to ask about session fees");
    expect(iframe().srcdoc).not.toContain("Half-day session");
    await click("After");
    expect(iframe().srcdoc).toContain("Half-day session");
    await click("Undo");
    expect(iframe().srcdoc).not.toContain("Half-day session");
    expect(node.textContent).toContain("No live website changed");
    await click("Reapply preview");
    expect(iframe().srcdoc).toContain("Full-day session");
    expect(iframe().getAttribute("sandbox")).toBe("");
    expect(iframe().srcdoc).not.toMatch(/<script|<form|src=/i);
    expect(outsideFetch).not.toHaveBeenCalled();
  });

  it("opens and closes history with the kit trigger and keeps focus on the trigger", async () => {
    root = createRoot(node);
    await act(async () => root!.render(createElement(OwnerConversationPreview, { frame: "Y2Tn3F", state: "ready" })));
    const button = [...node.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === "Earlier conversations")!;
    const panel = document.getElementById(button.getAttribute("aria-controls")!)!;
    expect(node.querySelector("details")).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(panel.getAttribute("aria-hidden")).toBe("true");
    button.focus();
    await act(async () => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hasAttribute("inert")).toBe(false);
    expect(panel.textContent).toContain("Conversations you start here are kept");
    await act(async () => button.click());
    expect(panel.getAttribute("aria-hidden")).toBe("true");
    expect(panel.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(button);
  });

  it("keeps typed yes separate from the exact fixture decision", async () => {
    const outsideFetch = vi.fn(() => { throw new Error("Fixture escaped to the network"); });
    vi.stubGlobal("fetch", outsideFetch);
    root = createRoot(node);
    await act(async () => root!.render(createElement(OwnerConversationPreview, { frame: "HQ5yA", state: "ready" })));
    const label = [...node.querySelectorAll<HTMLLabelElement>("label[for]")].find(item => item.textContent?.startsWith("Ask Strelva about"))!;
    const textarea = document.getElementById(label.htmlFor) as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "yes, publish it");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { textarea.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(node.textContent).toContain("Saying yes here doesn't publish or approve anything");
    const recovery = [...node.querySelectorAll<HTMLAnchorElement>("a")].filter(link => ["Go to Home", "Ask for help"].includes(link.textContent ?? ""));
    expect(recovery.map(link => link.getAttribute("href"))).toEqual(["/preview/strelva/owner-decision", "/preview/strelva/owner-conversation?frame=YsBMM"]);
    expect(node.textContent).not.toContain("Accepted in this preview. No live website changed.");
    const decision = [...node.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Make it live"))!;
    await act(async () => { decision.click(); });
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
    const make = [...node.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Make it live"))!;
    await act(async () => { make.click(); });
    expect(node.textContent).toContain("No System or record was saved.");
    await act(async () => root!.render(createElement(OwnerConversationPreview, { frame: "ABt1D", state: "ready" })));
    const confirm = [...node.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.startsWith("Confirm"))!;
    await act(async () => { confirm.click(); });
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
