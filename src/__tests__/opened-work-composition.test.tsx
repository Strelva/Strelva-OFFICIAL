// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceApp } from "@/experience/workspace/WorkspaceApp";
import { BUSINESS, WORK, SYSTEM, json, source, envelope, createOpenedWorkFixture } from "./fixtures/opened-work-composition";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams(window.location.search) }));
let root: Root | undefined;
let node: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.scrollTo = vi.fn(); HTMLElement.prototype.scrollTo = vi.fn();
  sessionStorage.clear();
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; node?.remove(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });
async function fixture(entrance: "workspace" | "system", command: () => Promise<Response>, read?: (id: string) => Promise<Response>, readOnly = false) {
  const { state, request: fixtureRequest } = await createOpenedWorkFixture(command, read, readOnly);
  const request = vi.fn(fixtureRequest);
  vi.stubGlobal("fetch", request);
  window.history.replaceState(null, "", `/workspace?workspaceId=${BUSINESS}&${entrance === "workspace" ? `view=websites&work=${WORK}` : `view=system&system=${SYSTEM}`}`);
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  await act(async () => root!.render(<WorkspaceApp request={request} />));
  return { request, state, async refreshParent() { await act(async () => root!.render(<WorkspaceApp request={request} signOut={<span>Parent refreshed</span>} />)); } };
}
function confirm() { return [...node.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Confirm")!; }

it.each(["workspace", "system"] as const)("retains an admitted website attempt through %s parent refresh and unknown settlement", async entrance => {
  let settle!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => { settle = resolve; });
  const command = vi.fn(() => pending);
  const { request, refreshParent } = await fixture(entrance, command);
  expect(node.textContent).toContain("2 decisions need you");
  await act(async () => confirm().click());
  expect(command).toHaveBeenCalledTimes(1);
  expect(confirm().disabled).toBe(true);
  const reads = request.mock.calls.filter(([input]) => String(input).includes("/rebuild?")).length;
  await refreshParent();
  expect(confirm().disabled).toBe(true);
  expect(request.mock.calls.filter(([input]) => String(input).includes("/rebuild?")).length).toBe(reads);
  await act(async () => settle(json({ error: "Response lost after fictional acceptance." }, 503)));
  expect(node.textContent).toContain("The change could not be confirmed");
  await refreshParent();
  expect(confirm().disabled).toBe(true);
  expect(node.textContent).toContain("Reload current state");
  await act(async () => confirm().click());
  expect(command).toHaveBeenCalledTimes(1);
});

it.each(["workspace", "system"] as const)("updates the saved website through %s while preserving its save refresh semantics", async entrance => {
  const command = vi.fn(async () => json(envelope(WORK, 2)));
  const { request, refreshParent } = await fixture(entrance, command);
  const before = request.mock.calls.filter(([input]) => new URL(String(input), "http://fictional.invalid").pathname === "/api/workspace").length;
  await act(async () => confirm().click());
  expect(node.textContent).toContain("Fact confirmed");
  expect(command).toHaveBeenCalledTimes(1);
  const after = request.mock.calls.filter(([input]) => new URL(String(input), "http://fictional.invalid").pathname === "/api/workspace").length;
  expect(after - before).toBe(entrance === "workspace" ? 1 : 0);
  await refreshParent();
  expect(node.textContent).toContain("Fact confirmed");
  expect(new URLSearchParams(window.location.search).get(entrance === "workspace" ? "work" : "system")).toBe(entrance === "workspace" ? WORK : SYSTEM);
});

it.each(["workspace", "system"] as const)("retains delegated read-only authority in %s opening", async entrance => {
  const command = vi.fn(async () => json(envelope(WORK, 2)));
  await fixture(entrance, command, undefined, true);
  expect(node.textContent).toContain("2 decisions need you");
  expect(confirm().disabled).toBe(true);
  await act(async () => confirm().click());
  expect(command).not.toHaveBeenCalled();
});

it.each(["workspace", "system"] as const)("shows loading and failed reads honestly in %s opening", async entrance => {
  let settle!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => { settle = resolve; });
  await fixture(entrance, async () => json({}), () => pending);
  expect(node.textContent).toContain("Opening the saved website");
  expect(confirm()).toBeUndefined();
  await act(async () => settle(json({ error: "Fictional read denied." }, 403)));
  expect(node.textContent).toContain("Fictional read denied");
  expect(confirm()).toBeUndefined();
});


it.each(["workspace", "system"] as const)("discards a superseded website read after %s work scope changes", async entrance => {
  let settle!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => { settle = resolve; });
  const secondWork = "61000000-0000-4000-8000-000000000003";
  const secondSystem = "61000000-0000-4000-8000-000000000004";
  const { state } = await fixture(entrance, async () => json({}), async id => id === WORK ? pending : json({ ...envelope(id), rebuild: { ...envelope(id).rebuild, title: "Second fictional website" } }));
  state.work.push(source(secondWork));
  state.systems!.systems.push({ ...state.systems!.systems[0]!, ref: { businessId: BUSINESS, systemId: secondSystem }, savedWorkId: secondWork, name: "Second fictional website" });
  await act(async () => {
    window.history.replaceState(null, "", `/workspace?workspaceId=${BUSINESS}&${entrance === "workspace" ? `view=websites&work=${secondWork}` : `view=system&system=${secondSystem}`}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(node.textContent).toContain("Second fictional website");
  await act(async () => settle(json({ ...envelope(), rebuild: { ...envelope().rebuild, title: "Superseded website response" } })));
  expect(node.textContent).not.toContain("Superseded website response");
  expect(node.textContent).toContain("Second fictional website");
});
