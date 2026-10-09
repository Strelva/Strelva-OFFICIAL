// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemPage } from "@/experience/systems/SystemPage";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import type { SystemView } from "@/experience/systems/model";

const workspaceId = crypto.randomUUID(), systemId = crypto.randomUUID();
const system: SystemView = { id: systemId, name: "Team intake", kind: "app", lifecycle: "draft", health: { state: "unknown", summary: "No checks yet." },
  surface: { kind: "work", workId: "intake", productId: "unknown" }, connections: [], versions: [], possibilities: [
    { id: "first", title: "Shorter intake", summary: "Remove one question.", status: "ready", affects: [systemId] },
    { id: "second", title: "Referral intake", summary: "Add a referral question.", status: "ready", affects: [systemId] },
  ] };
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function render(request: typeof fetch, readOnly = false) {
  const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(SystemPage, {
    system, systems: [system], workspaceId, readOnly, canMakeReal: true, sources: [], systemHref: id => `/systems/${id}`, onHome: () => undefined, onAsk: () => undefined,
  }))));
  return node;
}
function makeRealButtons(node: HTMLElement) { return [...node.querySelectorAll<HTMLButtonElement>("button")].filter(button => /Make real|Making real/.test(button.textContent || "")); }
function expectRecovery(node: HTMLElement) {
  expect(makeRealButtons(node).every(button => button.disabled)).toBe(true);
  expect([...node.querySelectorAll("a")].find(link => link.textContent === "Reload this System")?.getAttribute("href")).toBe(`/systems/${systemId}`);
}
describe("Make real acknowledgment and recovery", () => {
  it("blocks overlapping alternatives and rapid repeated activation requests", async () => {
    let finish!: (response: Response) => void;
    const request = vi.fn<typeof fetch>(() => new Promise<Response>(resolve => { finish = resolve; }));
    const node = await render(request);
    const [first, second] = makeRealButtons(node);
    await act(async () => { first!.click(); first!.click(); second!.click(); });
    expect(request).toHaveBeenCalledTimes(1);
    expect(makeRealButtons(node).every(button => button.disabled)).toBe(true);
    expect(makeRealButtons(node)[0]?.getAttribute("aria-busy")).toBe("true");
    await act(async () => finish(Response.json({ live: { live: true, status: "done_unverified", activationId: "activation-1", headline: "Partly live" } })));
    expect(node.textContent).toContain("Reload this System to see what landed");
    expectRecovery(node);
    await act(async () => makeRealButtons(node)[1]!.click());
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not claim unchanged live systems after losing a response", async () => {
    const request = vi.fn<typeof fetch>(async () => { throw new Error("Connection closed after POST"); });
    const node = await render(request); await act(async () => makeRealButtons(node)[0]!.click());
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("It may have started");
    expect(node.textContent).not.toContain("Your live systems are unchanged");
    expectRecovery(node);
  });
  it.each([Response.json({ error: "Outcome unavailable" }, { status: 500 }), new Response("", { status: 200 }), Response.json({ result: {} }), Response.json({ live: { headline: "Live." } })])("requires reload after an unconfirmed acknowledgment", async response => {
    const node = await render(vi.fn(async () => response)); await act(async () => makeRealButtons(node)[0]!.click());
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("check what landed");
    expect(node.textContent).not.toContain("Your live systems are unchanged");
    expectRecovery(node);
  });
  it("preserves the explicit isolated result and leaves isolated alternatives usable", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ result: { isolated: true, status: "in_progress", headline: "Isolated run", done: [], waiting: [], unknown: [], notStarted: [], liveUnchanged: true, notConnected: [] } }));
    const node = await render(request); await act(async () => makeRealButtons(node)[0]!.click());
    expect(node.textContent).toContain("Your live systems are unchanged");
    expect(makeRealButtons(node).every(button => !button.disabled)).toBe(true);
  });
  it("keeps read-only work blocked even when a caller supplies owner action availability", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({})); const node = await render(request, true);
    expect(makeRealButtons(node).every(button => button.disabled)).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
});
