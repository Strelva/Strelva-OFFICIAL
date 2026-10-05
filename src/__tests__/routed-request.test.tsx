// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { intentRequestFor, retainRequestIntent, spendRequestIntent, useWorkspaceIntent, WorkspaceIntent } from "@/experience/workspace/WorkspaceIntent";
import { readRequestDraft, requestDraftKey, writeRequestDraft } from "@/experience/workspace/request-draft";

class MemoryStorage implements Storage {
  private items = new Map<string, string>();
  get length() { return this.items.size; }
  key(index: number) { return [...this.items.keys()][index] ?? null; }
  getItem(name: string) { return this.items.get(name) ?? null; }
  setItem(name: string, value: string) { this.items.set(name, String(value)); }
  removeItem(name: string) { this.items.delete(name); }
  clear() { this.items.clear(); }
}

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function render(element: ReturnType<typeof createElement>) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => { root.render(element); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  return { node, root };
}

const key = requestDraftKey({ actorEmail: "owner@example.com", workspaceId: "business-1" });

function PlanProbe() { return createElement("output", null, intentRequestFor(useWorkspaceIntent(), "plan") ?? "none"); }

describe("routed request after reload", () => {
  it("opens the work plan with a request routed to applications", async () => {
    // Choosing Applications on Start stores route "applications" and opens the plan view.
    retainRequestIntent(sessionStorage, key, "A booking app for our two chairs.", "applications");
    const { node } = await render(<WorkspaceIntent draftKey={key} request=""><PlanProbe /></WorkspaceIntent>);
    expect(node.textContent).toBe("A booking app for our two chairs.");
  });

  it("keeps each route to its own product", () => {
    const intent = { request: "Organize supplier onboarding", route: "onboarding", ready: true };
    expect(intentRequestFor(intent, "onboarding")).toBe("Organize supplier onboarding");
    expect(intentRequestFor(intent, "plan")).toBeUndefined();
    expect(intentRequestFor(intent, "document")).toBeUndefined();
    expect(intentRequestFor({ ...intent, route: "plan" }, "plan")).toBe("Organize supplier onboarding");
    expect(intentRequestFor({ ...intent, route: "applications" }, "applications")).toBeUndefined();
  });
});

describe("spent request", () => {
  let memory: MemoryStorage;
  const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");
  beforeEach(() => { memory = new MemoryStorage(); Object.defineProperty(window, "sessionStorage", { value: memory, configurable: true }); });
  afterEach(() => { if (original) Object.defineProperty(window, "sessionStorage", original); });

  it("removes the routed request and its matching draft once the product saved work from it", () => {
    retainRequestIntent(memory, key, "Write our opening checklist.", "document");
    writeRequestDraft(memory, key, "Write our opening checklist.");
    spendRequestIntent(memory, key, "plan");
    expect(memory.getItem(`${key}:continuation`)).not.toBeNull();
    spendRequestIntent(memory, key, "document");
    expect(memory.getItem(`${key}:continuation`)).toBeNull();
    expect(readRequestDraft(memory, key)).toBe("");
  });

  it("keeps a draft the person edited after routing it", () => {
    retainRequestIntent(memory, key, "Build a booking app.", "applications");
    writeRequestDraft(memory, key, "Something new I am still typing");
    spendRequestIntent(memory, key, "plan");
    expect(memory.getItem(`${key}:continuation`)).toBeNull();
    expect(readRequestDraft(memory, key)).toBe("Something new I am still typing");
  });

  it("does not pre-fill a later blank document in the same tab", async () => {
    retainRequestIntent(memory, key, "Write our opening checklist.", "document");
    function Document() {
      const intent = useWorkspaceIntent();
      return <><output>{intentRequestFor(intent, "document") ?? "blank"}</output><button type="button" onClick={() => intent.spend("document")}>Save document</button></>;
    }
    // Layout keeps the routed request in memory too; spending must clear that copy.
    function Host() {
      const [request, setRequest] = useState("Write our opening checklist.");
      const [current, setCurrent] = useState(true);
      return <WorkspaceIntent draftKey={key} request={request} current={current} route="document" onSpent={() => { setRequest(""); setCurrent(true); }}><Document /></WorkspaceIntent>;
    }
    const first = await render(<Host />);
    expect(first.node.querySelector("output")?.textContent).toBe("Write our opening checklist.");
    await act(async () => first.node.querySelector("button")!.click());
    expect(first.node.querySelector("output")?.textContent).toBe("blank");
    await act(async () => first.root.unmount());

    const later = await render(<WorkspaceIntent draftKey={key} request=""><Document /></WorkspaceIntent>);
    expect(later.node.querySelector("output")?.textContent).toBe("blank");
  });
});
