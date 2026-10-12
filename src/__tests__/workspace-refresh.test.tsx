// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceApp } from "@/experience/workspace/WorkspaceApp";
import { createPreviewRequest } from "@/experience/workspace/preview/fixture";
import { serverWebsiteTransport } from "@/experience/websites/contracts";
import { envelope, source } from "./fixtures/opened-work-composition";
import type { WebsiteRecord } from "@/products/websites/contracts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));

const BUSINESS = "33333333-3333-4333-8333-333333333333";
const OTHER = "11111111-1111-4111-8111-111111111111";
const WORK = "55555555-5555-4555-8555-555555555555";
const NOTICE = "Saved preview 1 is approved. Prepare launch when you are ready.";
let root: ReturnType<typeof createRoot>;

function website(approved = false): WebsiteRecord {
  return {
    workspaceId: BUSINESS, workId: WORK,
    createdAt: "2026-10-09T12:00:00.000Z", updatedAt: "2026-10-09T12:00:00.000Z",
    website: {
      version: 1, revision: approved ? 2 : 1, title: "Fictional Harbor website",
      brief: { businessName: "Fictional Harbor", description: "A fictional local fixture.", primaryCallToAction: "Contact us" },
      status: approved ? "approved" : "preview_ready", approvedCandidateRevision: approved ? 1 : null,
      candidate: {
        kind: "website_candidate", revision: 1, contentHash: "a".repeat(64), rendererDigest: "b".repeat(64), artifactDigest: "c".repeat(64),
        preview: { href: "/preview/websites/fixture", revision: 1, contentHash: "a".repeat(64) }, generatedAt: "2026-10-09T12:00:00.000Z",
        spec: { version: 1, siteName: "Fictional Harbor", content: {}, pages: { home: {} }, theme: {} },
      },
      launch: { status: "not_requested", candidateRevision: null, receipt: null, failure: null },
      lastError: null, createdBy: "fictional-owner", createdAt: "2026-10-09T12:00:00.000Z", history: [],
    },
  };
}

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "No fixture connection." }, { status: 404 })));
  window.scrollTo = () => undefined;
  Element.prototype.scrollTo = () => undefined;
  vi.spyOn(serverWebsiteTransport, "read").mockResolvedValue(website());
  vi.spyOn(serverWebsiteTransport, "approve").mockResolvedValue(website(true));
  window.history.replaceState(null, "", `/workspace?workspaceId=${BUSINESS}&view=websites&work=${WORK}`);
});
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); }

async function savedWebsite(version: 1 | 2 = 1, deferRetry = false, deferMutation = false) {
  const base = createPreviewRequest("business");
  let reads = 0;
  let websiteReads = 0;
  let mutations = 0;
  const notice = version === 1 ? NOTICE : "Fact confirmed in a new revision.";
  const selector = `section[aria-label="${version === 1 ? "Website setup" : "Website rebuild"}"]`;
  let release!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { release = resolve; });
  let releaseRetry!: (response: Response) => void;
  const retryPending = new Promise<Response>(resolve => { releaseRetry = resolve; });
  let releaseMutation!: (response: Response) => void;
  const mutationPending = new Promise<Response>(resolve => { releaseMutation = resolve; });
  const snapshot = async (workspaceId = BUSINESS, removed = false) => {
    const data = await (await base(`/api/workspace?workspaceId=${workspaceId}`)).json();
    data.actor.localPreview = false;
    data.work = removed ? [] : [version === 2 ? source(WORK) : { ...data.work[0], id: WORK, productId: "websites", resourceKind: "website", title: "Fictional Harbor website", assessment: undefined, payload: null }];
    return Response.json(data);
  };
  const request = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://test.invalid");
    if (url.pathname === `/api/websites/${WORK}/rebuild`) { websiteReads += 1; return Response.json(envelope(WORK, mutations ? 2 : 1)); }
    if (init?.method === "POST" && url.pathname.includes("/facts/")) { mutations += 1; return deferMutation && mutations === 2 ? mutationPending : Response.json(envelope(WORK, mutations + 1)); }
    if (url.pathname !== "/api/workspace") return base(input, init);
    reads += 1;
    if (url.searchParams.get("workspaceId") === BUSINESS && reads === 2) return pending;
    if (url.searchParams.get("workspaceId") === BUSINESS && reads === 3 && deferRetry) return retryPending;
    return snapshot(url.searchParams.get("workspaceId") || BUSINESS);
  }) as typeof fetch;
  vi.stubGlobal("fetch", request);
  const node = document.createElement("div"); document.body.appendChild(node);
  root = createRoot(node);
  await act(async () => root.render(<WorkspaceApp request={request} />)); await settle();
  const tool = node.querySelector<HTMLElement>(selector)!;
  expect(tool).not.toBeNull();
  const approve = [...tool.querySelectorAll("button")].find(button => version === 1 ? button.textContent?.includes("Approve this preview") : button.textContent?.trim() === "Confirm")!;
  expect(approve).toBeDefined();
  await act(async () => approve.click()); await settle();
  // The workspace GET deliberately remains unresolved across a committed render.
  expect(reads).toBe(2);
  return { node, tool, release, releaseRetry, releaseMutation, snapshot, selector, notice, counts: () => ({ reads, websiteReads, mutations }) };
}

it.each([1, 2] as const)("V%s same-work save keeps the real website session and local notice through a deferred snapshot refresh", async version => {
  const { node, tool, release, snapshot, selector, notice, counts } = await savedWebsite(version);
  const before = counts();
  expect(node.querySelector(selector)).toBe(tool);
  expect(tool.textContent).toContain(notice);
  expect(counts()).toEqual(before);
  await act(async () => release(await snapshot())); await settle();
  expect(node.querySelector(selector)).toBe(tool);
  expect(tool.textContent).toContain(notice);
  expect(counts()).toEqual(before);
});

it.each([1, 2] as const)("V%s refused deferred refresh removes the old session for 401/403/404", async version => {
  for (const status of [401, 403, 404]) {
  const { node, tool, release } = await savedWebsite(version);
  await act(async () => release(Response.json({ error: "Workspace access refused." }, { status }))); await settle();
  expect(node.contains(tool)).toBe(false);
  expect(node.textContent).toContain("Workspace access refused.");
  if (status === 401) expect(new URL(node.querySelector<HTMLAnchorElement>('a[href^="/sign-in?next="]')!.href).searchParams.get("next")).toBe(`/workspace?workspaceId=${BUSINESS}&view=websites&work=${WORK}`);
  await act(async () => root.unmount()); node.remove();
  }
});

it.each([1, 2] as const)("V%s temporary500 preserves accepted state and reports the separate read failure", async version => {
  const { node, tool, release, selector, notice, counts } = await savedWebsite(version);
  const before = counts();
  await act(async () => release(Response.json({ error: "Snapshot temporarily unavailable." }, { status: 500 }))); await settle();
  expect(node.querySelector(selector)).toBe(tool);
  expect(tool.textContent).toContain(notice);
  expect(node.querySelector('[role="alert"]')?.textContent).toContain("Snapshot temporarily unavailable.");
  expect(counts()).toEqual(before);
});

it.each([1, 2] as const)("V%s refreshed delegated read keeps accepted work and removes write authority", async version => {
  const { node, tool, release, snapshot, selector } = await savedWebsite(version);
  const data = await (await snapshot()).json();
  const current = data.workspaces.find((workspace: { id: string }) => workspace.id === BUSINESS);
  current.access = "delegated_read";
  await act(async () => release(Response.json(data))); await settle();
  expect(node.querySelector(selector)).toBe(tool);
  if (version === 1) expect(tool.textContent).toContain("You can review this website, but this access level cannot change it.");
  else expect([...tool.querySelectorAll("button")].filter(button => button.textContent?.trim() === "Confirm").every(button => button.disabled)).toBe(true);
  expect([...tool.querySelectorAll("button")].some(button => button.textContent?.includes("Prepare launch"))).toBe(false);
});

it.each([1, 2] as const)("V%s missing saved work becomes unavailable", async version => {
  const { node, tool, release, snapshot } = await savedWebsite(version);
  await act(async () => release(await snapshot(BUSINESS, true))); await settle();
  expect(node.contains(tool)).toBe(false);
  expect(node.textContent).toContain("This saved result is unavailable.");
});

it.each([1, 2] as const)("V%s business switch rejects a late snapshot and resets the session", async version => {
  const { node, tool, release, snapshot, selector } = await savedWebsite(version);
  await act(async () => { window.history.pushState(null, "", `/workspace?workspaceId=${OTHER}`); window.dispatchEvent(new PopStateEvent("popstate")); }); await settle();
  expect(node.contains(tool)).toBe(false);
  expect(new URLSearchParams(window.location.search).get("workspaceId")).toBe(OTHER);
  await act(async () => release(await snapshot())); await settle();
  expect(new URLSearchParams(window.location.search).get("workspaceId")).toBe(OTHER);
  expect(node.querySelector(selector)).toBeNull();
});


it.each([[1, 500], [1, 503], [2, 500], [2, 503]] as const)("V%s deferred workspace retry after %s restores callbacks without replacing accepted tool", async (version, status) => {
  const { node, tool, release, releaseRetry, snapshot, selector, notice, counts } = await savedWebsite(version, true);
  await act(async () => release(Response.json({ error: "Snapshot temporarily unavailable." }, { status }))); await settle();
  expect(node.querySelector(selector)).toBe(tool);
  expect(tool.textContent).toContain(notice);
  const retry = [...node.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Retry workspace refresh");
  expect(retry).toBeDefined();
  expect([...node.querySelectorAll("button")].some(button => button.textContent === "Dismiss")).toBe(false);
  await act(async () => retry!.click()); await settle();
  expect(retry!.disabled).toBe(true);
  expect(node.querySelector(selector)).toBe(tool);
  expect(tool.textContent).toContain(notice);
  await act(async () => releaseRetry(await snapshot())); await settle();
  expect(node.querySelector(selector)).toBe(tool);
  expect(tool.textContent).toContain(notice);
  expect(node.textContent).not.toContain("Snapshot temporarily unavailable.");
  expect(counts().reads).toBe(3);
  if (version === 1) {
    const next = website(true); next.website.revision = 3; next.website.status = "launch_pending";
    next.website.launch = { status: "pending", candidateRevision: 1, receipt: null, failure: null };
    vi.spyOn(serverWebsiteTransport, "prepareLaunch").mockResolvedValue(next);
  }
  const nextAction = [...tool.querySelectorAll<HTMLButtonElement>("button")].find(button => version === 1 ? button.textContent === "Prepare launch" : button.textContent === "Confirm");
  expect(nextAction).toBeDefined();
  await act(async () => nextAction!.click()); await settle();
  expect(counts().reads).toBe(4);
  expect(node.querySelector(selector)).toBe(tool);
  expect(new URLSearchParams(window.location.search).get("work")).toBe(WORK);
  if (version === 2) expect(counts().mutations).toBe(2);
});


it.each([1, 2] as const)("V%s failed workspace retry keeps accepted tool and can retry again", async version => {
  const { node, tool, release, releaseRetry, selector, notice, counts } = await savedWebsite(version, true);
  await act(async () => release(Response.json({ error: "Initial snapshot failure." }, { status: 500 }))); await settle();
  const retry = () => [...node.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Retry workspace refresh")!;
  expect(retry()).toBeDefined();
  await act(async () => retry().click()); await settle();
  expect(node.querySelector(selector)).toBe(tool);
  await act(async () => releaseRetry(Response.json({ error: "Retry snapshot failure." }, { status: 503 }))); await settle();
  expect(node.querySelector(selector)).toBe(tool);
  expect(tool.textContent).toContain(notice);
  expect(node.textContent).toContain("Retry snapshot failure.");
  await act(async () => retry().click()); await settle();
  expect(node.querySelector(selector)).toBe(tool);
  expect(tool.textContent).toContain(notice);
  expect(node.textContent).not.toContain("Retry snapshot failure.");
  expect(counts().reads).toBe(4);
});

it.each([1, 2] as const)("V%s retry403 discards retained access", async version => {
  const { node, tool, release, releaseRetry } = await savedWebsite(version, true);
  await act(async () => release(Response.json({ error: "Snapshot failure." }, { status: 503 }))); await settle();
  const retry = [...node.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Retry workspace refresh");
  expect(retry).toBeDefined();
  expect([...node.querySelectorAll("button")].some(button => button.textContent === "Dismiss")).toBe(false);
  await act(async () => retry!.click()); await settle();
  expect(node.contains(tool)).toBe(true);
  await act(async () => releaseRetry(Response.json({ error: "Current access refused." }, { status: 403 }))); await settle();
  expect(node.contains(tool)).toBe(false);
  expect(node.textContent).toContain("Current access refused.");
});

it.each([1, 2] as const)("V%s navigation during retry rejects late snapshot and save callback", async version => {
  const { node, tool, release, releaseRetry, releaseMutation, snapshot, selector, counts } = await savedWebsite(version, true, true);
  await act(async () => release(Response.json({ error: "Snapshot failure." }, { status: 500 }))); await settle();
  const retry = [...node.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Retry workspace refresh");
  expect(retry).toBeDefined();
  expect([...node.querySelectorAll("button")].some(button => button.textContent === "Dismiss")).toBe(false);
  await act(async () => retry!.click()); await settle();
  let completeLaunch!: (record: WebsiteRecord) => void;
  if (version === 1) vi.spyOn(serverWebsiteTransport, "prepareLaunch").mockImplementation(() => new Promise(resolve => { completeLaunch = resolve; }));
  const nextAction = [...tool.querySelectorAll<HTMLButtonElement>("button")].find(button => version === 1 ? button.textContent === "Prepare launch" : button.textContent === "Confirm")!;
  await act(async () => nextAction.click()); await settle();
  await act(async () => { window.history.pushState(null, "", `/workspace?workspaceId=${OTHER}`); window.dispatchEvent(new PopStateEvent("popstate")); }); await settle();
  expect(node.contains(tool)).toBe(false);
  const before = counts().reads;
  await act(async () => { releaseRetry(await snapshot()); if (version === 1) completeLaunch(website(true)); else releaseMutation(Response.json(envelope(WORK, 3))); }); await settle();
  expect(new URLSearchParams(window.location.search).get("workspaceId")).toBe(OTHER);
  expect(node.querySelector(selector)).toBeNull();
  expect(counts().reads).toBe(before);
});
