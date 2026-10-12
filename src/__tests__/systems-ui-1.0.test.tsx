// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StPage } from "@/components/ui/strelva/Kit";
import { PossibilityTry } from "@/experience/systems/PossibilityTry";
import { MakeRealProgress, makeRealStepState } from "@/experience/systems/MakeRealProgress";
import { SystemPage } from "@/experience/systems/SystemPage";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import type { SystemView } from "@/experience/systems/model";

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
async function render(element: React.ReactNode) {
  const node = document.createElement("div"); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(element));
  return node;
}

describe("Systems 1.0 presentation boundaries", () => {
  it("composes Version account controls and publication history into the System’s common destinations", async () => {
    const workspaceId = "a0000000-0000-4000-8000-000000000001", systemId = "51000000-0000-4000-8000-000000000003", versionId = "51000000-0000-4000-8000-000000000004";
    const system: SystemView = { id: systemId, name: "Team intake", detail: "", kind: "app", lifecycle: "draft", health: { state: "unknown", summary: "No checks yet." },
      surface: { kind: "work", workId: "intake", productId: "unknown" }, connections: [], versions: [], possibilities: [], storedVersionId: versionId,
      history: [{ id: "earlier-change", at: "2026-10-09T00:00:00Z", sentence: "The intake title changed.", actor: { kind: "platform" } }] };
    const request = vi.fn<typeof fetch>(async input => String(input).includes("/versions/manage") ? Response.json({ workspaceId, systemId, versionId, rowRevision: 1, canManage: true, workingDefinition: {},
      releases: [{ number: 1, releasedAt: "2026-10-01" }], overrides: [], bindings: [{ kind: "booking_calendar", connectionId: "calendar" }], bindingChoices: [{ kind: "booking_calendar", connectionId: "calendar", label: "Team calendar" }] }) : Response.json({ error: "Fixture unavailable" }, { status: 503 }));
    const node = await render(<WorkspaceRequestContext.Provider value={request}><SystemPage system={system} systems={[system]} workspaceId={workspaceId} readOnly={false} sources={[]} systemHref={id => `/systems/${id}`} onHome={() => undefined} onAsk={() => undefined} /></WorkspaceRequestContext.Provider>);
    const headings = [...node.querySelectorAll("h2")].map(heading => heading.textContent);
    expect(headings.filter(title => title === "History")).toHaveLength(1); expect(headings.filter(title => title === "Connections")).toHaveLength(1);
    const connections = node.querySelector(`[id="${systemId}-connections"]`)!.closest("section")!; expect(connections.textContent).toContain("Team calendar"); expect(connections.textContent).toContain("Connect an account");
    const history = node.querySelector(`[id="${systemId}-history"]`)!.closest("section")!; expect(history.textContent).toContain("Published Oct 1"); expect(history.textContent).toContain("The intake title changed."); expect(history.textContent).toContain("Restore into draft");
    expect(node.querySelector(`[id="${systemId}-version-draft"]`)!.closest("section")!.textContent).not.toContain("Published Oct 1");
    expect(request.mock.calls.filter(([url]) => String(url).includes("/versions/manage"))).toHaveLength(1);
  });

  it("keeps the signed visitor preview unable to approve or send a real submission", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    const node = await render(createElement(PossibilityTry, { state: { kind: "ready", view: {
      title: "Shorter intake", intent: "Try the shorter form", changes: ["The intake form"], introduces: [], takesSubmissions: true,
    } } }));
    const approve = [...node.querySelectorAll<HTMLButtonElement>("button")].find(button => /^(Make real|Make it live)$/.test(button.textContent ?? ""));
    expect(approve?.disabled).toBe(true);
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(node.textContent).toContain("Test submission, nobody was told");
    expect(request).not.toHaveBeenCalled();
  });

  it("does not permit stale ready data to start Make real", async () => {
    const request = vi.fn<typeof fetch>();
    const system: SystemView = { id: "internal", name: "Team intake", detail: "", kind: "app", lifecycle: "draft", health: { state: "unknown", summary: "No checks yet." },
      surface: { kind: "work", workId: "intake", productId: "unknown" }, connections: [], versions: [], possibilities: [
        { executionAvailability: "live", id: "old", title: "Shorter intake", summary: "Remove a question", status: "ready", staleReason: "The intake changed.", affects: ["internal"], openHref: "/workspace?work=intake" },
      ] };
    const node = await render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(SystemPage, {
      system, systems: [system], workspaceId: "business", readOnly: false, canMakeReal: true, sources: [], systemHref: id => `/systems/${id}`, onHome: () => {}, onAsk: () => {},
    })));
    const approve = [...node.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Make it live");
    expect(approve?.disabled).toBe(true);
    await act(async () => approve?.click());
    expect(request).not.toHaveBeenCalled();
    expect(node.textContent).not.toContain("Try it as a visitor");
    expect([...node.querySelectorAll("a")].find(link => link.textContent === "Open")?.getAttribute("href")).toBe("/workspace?work=intake");
  });

  it("keeps accepted but unconfirmed outcomes visible beside pending steps", async () => {
    expect(makeRealStepState("Done")).toBe("done");
    expect(makeRealStepState("Done, not yet confirmed")).toBe("unverified");
    expect(makeRealStepState("Not sure yet")).toBe("unverified");
    const node = await render(createElement(MakeRealProgress, { activation: {
      id: "change", title: "Consult booking", headline: "Partly live", partlyLive: true, done: 1, total: 3, lines: [
        { label: "Publish page", state: "Done, not yet confirmed", detail: "The provider accepted it; read-back failed." },
        { label: "Check page", state: "Not started", detail: "Running now." },
        { label: "Connect Google", state: "Waiting", detail: "Access not approved." },
      ],
    } }));
    expect(node.textContent).toContain("The provider accepted it; read-back failed.");
    expect(node.textContent).toContain("Some changes have landed");
    expect(node.querySelector('[aria-current="step"]')?.textContent).toContain("Check page");
    expect(node.textContent).not.toContain("Nothing is live");
  });

  it("gives nested native pages one set of page insets", async () => {
    const node = await render(createElement(StPage, null, createElement(StPage, null, "Native object")));
    expect(node.querySelectorAll('[data-nested="true"]')).toHaveLength(1);
    expect(node.textContent).toBe("Native object");
  });
});
