// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceApp } from "@/experience/workspace/WorkspaceApp";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";
import { createSystemsPreviewRequest } from "@/experience/workspace/preview/systems-fixture";
import { previewWebsiteDetail } from "@/experience/workspace/preview/website-detail-fixture";

const OLD = "d0000000-0000-4000-8000-000000000001";
const CURRENT = "d0000000-0000-4000-8000-000000000002";
const SITE = "d0000000-0000-4000-8000-000000000003";
const OTHER = "d0000000-0000-4000-8000-000000000004";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
let root: Root | null;
let node: HTMLDivElement;
beforeEach(() => { HTMLElement.prototype.scrollTo = vi.fn(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node); });
afterEach(async () => { if (root) await act(async () => root!.unmount()); node.remove(); Reflect.deleteProperty(HTMLElement.prototype, "scrollTo"); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const makeReal = () => [...node.querySelectorAll("button")].find(button => button.textContent === "Make real");

async function scenario(options: { role?: "member"; observed?: string; foreign?: "workspace" | "system";
  refresh?: (fresh: WorkspaceSnapshot, signal: AbortSignal | null | undefined) => Promise<Response>; detail?: () => Promise<Response> } = {}) {
  const preview = createSystemsPreviewRequest("mooney");
  const old = await (await preview("/api/workspace")).json() as WorkspaceSnapshot;
  old.releases = { ...old.releases, systems: true };
  if (options.role) old.workspaces[0]!.role = options.role;
  old.systems = { status: "ready", systems: [{ ref: { businessId: old.workspaceId, systemId: SITE },
    currentRevisionId: OLD, name: "attymooney.com", kind: "website", lifecycle: "live", basis: null, savedWorkId: null, tenantId: "mooney-firm",
    health: { status: "unknown", summary: "Not checked", lastVerifiedAt: null } }], connections: [],
    possibilities: [{ id: "stored-reviewed-rebuild", title: "Reviewed rebuild", summary: "Reviewed candidate", status: "ready",
      affects: [SITE], evidence: null, previewHref: null, workId: "reviewed-work", stored: true }] };
  const fresh = structuredClone(old);
  fresh.systems!.systems[0]!.currentRevisionId = CURRENT;
  fresh.systems!.possibilities[0]!.status = "exploring";
  fresh.systems!.possibilities[0]!.staleReason = "The website changed. Review the alternative again.";
  const heldOldWorkspace = deferred<Response>();
  const requests: Array<{ url: string; method: string; signal?: AbortSignal | null }> = [];
  const transport = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); requests.push({ url, method: init?.method ?? "GET", signal: init?.signal });
    if (url.startsWith("/api/workspace/systems/website?")) return options.detail ? options.detail() : json({ detail: {
      ...previewWebsiteDetail(options.foreign === "system" ? OTHER : SITE, "empty"),
      workspaceId: options.foreign === "workspace" ? OTHER : old.workspaceId, currentRevisionId: options.observed ?? CURRENT,
    } });
    if (url.startsWith("/api/workspace?")) {
      const params = new URL(url, "http://localhost").searchParams;
      if (params.get("systemsReadOnly") === "1") return options.refresh ? options.refresh(fresh, init?.signal) : json(fresh);
      if (params.get("workspaceId") === OTHER) return json({ ...old, workspaceId: OTHER,
        workspaces: [...old.workspaces, { id: OTHER, kind: "customer", name: "Other business", role: "owner" }],
        systems: { status: "ready", systems: [], connections: [], possibilities: [] } });
      return (await heldOldWorkspace.promise).clone();
    }
    return preview(input, init);
  }) as typeof fetch;
  window.history.replaceState(null, "", `/workspace?workspaceId=${old.workspaceId}&view=system&system=${SITE}`);
  await act(async () => root!.render(<WorkspaceApp request={transport} signOut={<span />} />));
  return { old, fresh, requests, async release() { await act(async () => heldOldWorkspace.resolve(json(old))); await flush(); } };
}

it("refreshes a held old workspace after newer website detail without changing reviewed pins", async () => {
  const state = await scenario();
  // The old projection was captured before reconciliation and held in transit.
  await state.release();
  expect(state.requests.filter(item => item.url.includes("systemsReadOnly=1"))).toHaveLength(1);
  expect(state.requests.every(item => item.method === "GET")).toBe(true);
  expect(node.textContent).toContain("The website changed. Review the alternative again.");
  expect(makeReal()?.disabled).toBe(true);
});

it("does not refresh unchanged revisions or turn a member's refreshed candidate into authority", async () => {
  const same = await scenario({ observed: OLD });
  await same.release();
  expect(same.requests.some(item => item.url.includes("systemsReadOnly=1"))).toBe(false);
  expect(makeReal()?.disabled).toBe(false);
});

it("a member refresh reads only and retains the owner-only control", async () => {
  const state = await scenario({ role: "member" }); await state.release();
  expect(state.requests.filter(item => item.url.includes("systemsReadOnly=1"))).toHaveLength(1);
  expect(state.requests.every(item => item.method === "GET")).toBe(true);
  expect(makeReal()?.disabled).toBe(true);
});

it.each(["workspace", "system"] as const)("refuses foreign %s detail without refreshing or showing Ready controls", async (foreign) => {
  const state = await scenario({ foreign }); await state.release();
  expect(state.requests.some(item => item.url.includes("systemsReadOnly=1"))).toBe(false);
  expect(node.textContent).toContain("could not be confirmed");
  expect(makeReal()?.disabled).toBe(true);
});

it("keeps stale controls blocked when refresh fails, then retries the read", async () => {
  let attempts = 0;
  const state = await scenario({ refresh: async fresh => ++attempts === 1 ? json({ error: "Unavailable" }, 503) : json(fresh) });
  await state.release();
  expect(makeReal()?.disabled).toBe(true);
  expect(node.textContent).toContain("Retry before deciding");
  await act(async () => [...node.querySelectorAll("button")].find(button => button.textContent === "Retry current state")!.click());
  await flush();
  expect(attempts).toBe(2);
  expect(node.textContent).toContain("Review the alternative again");
});

it("ignores an older refresh response and retains blocked controls", async () => {
  const state = await scenario({ refresh: async fresh => {
    fresh.systems!.systems[0]!.currentRevisionId = OLD;
    fresh.systems!.possibilities[0]!.status = "ready";
    return json(fresh);
  } });
  await state.release();
  expect(node.textContent).toContain("Retry before deciding");
  expect(makeReal()?.disabled).toBe(true);
});

it.each(["workspace", "system"] as const)("ignores a pending refresh after switching %s", async (selection) => {
  const heldRefresh = deferred<Response>();
  const state = await scenario({ refresh: async () => heldRefresh.promise }); await state.release();
  const query = selection === "workspace" ? `workspaceId=${OTHER}` : `workspaceId=${state.old.workspaceId}&view=system&system=${OTHER}`;
  await act(async () => { window.history.replaceState(null, "", `/workspace?${query}`); window.dispatchEvent(new PopStateEvent("popstate")); });
  await flush();
  await act(async () => heldRefresh.resolve(json(state.fresh)));
  expect(node.textContent).not.toContain("The website changed. Review the alternative again.");
  if (selection === "workspace") expect(node.textContent).toContain("Other business");
  else expect(node.textContent).toContain("This system isn’t available here");
});

it("unmounting aborts a pending refresh and ignores its eventual response", async () => {
  const heldRefresh = deferred<Response>();
  const state = await scenario({ refresh: async () => heldRefresh.promise }); await state.release();
  const signal = state.requests.find(item => item.url.includes("systemsReadOnly=1"))!.signal;
  await act(async () => root!.unmount()); root = null;
  expect(signal?.aborted).toBe(true);
  await act(async () => heldRefresh.resolve(json(state.fresh)));
  expect(node.textContent).toBe("");
});

it("a late detail response cannot start refresh after leaving the System", async () => {
  const heldDetail = deferred<Response>();
  const state = await scenario({ detail: () => heldDetail.promise }); await state.release();
  expect(makeReal()?.disabled).toBe(true);
  await act(async () => root!.unmount()); root = null;
  await act(async () => heldDetail.resolve(json({ detail: { ...previewWebsiteDetail(SITE, "empty"), workspaceId: state.old.workspaceId, currentRevisionId: CURRENT } })));
  expect(state.requests.some(item => item.url.includes("systemsReadOnly=1"))).toBe(false);
});
