// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StandingResponsibilityPicker } from "@/experience/operations/ResponsibilityExperience";
import type { WorkspaceWork } from "@/experience/workspace/contracts";

const workspaceId = "33333333-3333-4333-8333-333333333333";
const source: WorkspaceWork = { id: "saved-check", workspaceId, productId: "investigations", resourceKind: "investigation", title: "Compare invoices", payload: null, input: {}, createdAt: "2026-10-11T00:00:00Z" };
let root: ReturnType<typeof createRoot> | undefined;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function render(sources: WorkspaceWork[], readOnly = false) {
  const node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  const onCreated = vi.fn();
  await act(async () => root!.render(createElement(StandingResponsibilityPicker, { workspaceId, sources, readOnly, onOpen: vi.fn(), onCreated })));
  return { node, onCreated };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

it("offers the existing saved-check creation destination from the empty Running setup", async () => {
  window.history.replaceState(null, "", `/workspace?workspaceId=${workspaceId}&view=operations`);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ responsibilities: [] })));
  const { node } = await render([]);
  const create = [...node.querySelectorAll("button")].find(button => button.textContent === "Keep something running")!;
  await act(async () => create.click());
  const link = [...node.querySelectorAll("a")].find(anchor => anchor.textContent === "Create a saved check")!;
  const url = new URL(link.href);
  expect(url.searchParams.get("workspaceId")).toBe(workspaceId);
  expect(url.searchParams.get("view")).toBe("investigations");
  expect(url.searchParams.get("returnTo")).toBe("running");
  expect(node.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
});

it("selects the returned check and preserves it when server authority rejects preparation", async () => {
  window.history.replaceState(null, "", `/workspace?workspaceId=${workspaceId}&view=operations&savedCheck=${source.id}`);
  const request = vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "POST" ? json({ error: "Only the owner can prepare this scope." }, 403) : json({ responsibilities: [] }));
  vi.stubGlobal("fetch", request);
  const { node, onCreated } = await render([source]);
  expect(node.querySelector<HTMLSelectElement>("#standing-source")?.value).toBe(source.id);
  await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  const body = JSON.parse(String(request.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body));
  expect(body).toMatchObject({ action: "standing_create", workspaceId, input: { scope: { steps: [{ workId: source.id, operation: "investigation.run" }] }, limits: { maxConcurrentJobs: 1, maxRuns: 10 } } });
  expect(node.textContent).toContain("Only the owner can prepare this scope.");
  expect(node.querySelector<HTMLSelectElement>("#standing-source")?.value).toBe(source.id);
  expect(onCreated).not.toHaveBeenCalled();
});

it.each([{ queryWorkspace: workspaceId, readOnly: true }, { queryWorkspace: "another-business", readOnly: false }])("does not let a return hint open creation with readOnly=$readOnly in $queryWorkspace", async ({ queryWorkspace, readOnly }) => {
  window.history.replaceState(null, "", `/workspace?workspaceId=${queryWorkspace}&view=operations&savedCheck=${source.id}`);
  const request = vi.fn().mockResolvedValue(json({ responsibilities: [] })); vi.stubGlobal("fetch", request);
  const { node } = await render([source], readOnly);
  expect(node.querySelector("form")).toBeNull();
  if (readOnly) expect(node.textContent).not.toContain("Keep something running");
  expect(request.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});
