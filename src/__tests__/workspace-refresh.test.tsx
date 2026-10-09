// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceApp } from "@/experience/workspace/WorkspaceApp";
import { createPreviewRequest } from "@/experience/workspace/preview/fixture";
import { serverWebsiteTransport } from "@/experience/websites/contracts";
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

async function savedWebsite() {
  const base = createPreviewRequest("business");
  let reads = 0;
  let release!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { release = resolve; });
  const snapshot = async (workspaceId = BUSINESS, removed = false) => {
    const data = await (await base(`/api/workspace?workspaceId=${workspaceId}`)).json();
    data.actor.localPreview = false;
    data.work = removed ? [] : [{ ...data.work[0], id: WORK, productId: "websites", resourceKind: "website", title: "Fictional Harbor website", assessment: undefined, payload: null }];
    return Response.json(data);
  };
  const request = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://test.invalid");
    if (url.pathname !== "/api/workspace") return base(input, init);
    if (url.searchParams.get("workspaceId") === BUSINESS && ++reads === 2) return pending;
    return snapshot(url.searchParams.get("workspaceId") || BUSINESS);
  }) as typeof fetch;
  const node = document.createElement("div"); document.body.appendChild(node);
  root = createRoot(node);
  await act(async () => root.render(<WorkspaceApp request={request} />)); await settle();
  const tool = node.querySelector<HTMLElement>('section[aria-label="Website setup"]')!;
  expect(tool).not.toBeNull();
  const approve = [...tool.querySelectorAll("button")].find(button => button.textContent?.includes("Approve this preview"))!;
  expect(approve).toBeDefined();
  await act(async () => approve.click()); await settle();
  // The workspace GET deliberately remains unresolved across a committed render.
  expect(reads).toBe(2);
  return { node, tool, release, snapshot };
}

it("same-work save keeps the real website session and local notice through a deferred snapshot refresh", async () => {
  const { node, tool, release, snapshot } = await savedWebsite();
  expect(node.querySelector('section[aria-label="Website setup"]')).toBe(tool);
  expect(tool.querySelector('[role="status"]')?.textContent).toBe(NOTICE);
  expect(serverWebsiteTransport.read).toHaveBeenCalledTimes(1);
  await act(async () => release(await snapshot())); await settle();
  expect(node.querySelector('section[aria-label="Website setup"]')).toBe(tool);
  expect(tool.querySelector('[role="status"]')?.textContent).toBe(NOTICE);
  expect(serverWebsiteTransport.read).toHaveBeenCalledTimes(1);
});

it.each([401, 403, 404])("a refused deferred refresh (%s) removes the old website session", async status => {
  const { node, tool, release } = await savedWebsite();
  await act(async () => release(Response.json({ error: "Workspace access refused." }, { status }))); await settle();
  expect(node.contains(tool)).toBe(false);
  expect(node.textContent).toContain("Workspace access refused.");
  if (status === 401) expect(new URL(node.querySelector<HTMLAnchorElement>('a[href^="/sign-in?next="]')!.href).searchParams.get("next")).toBe(`/workspace?workspaceId=${BUSINESS}&view=websites&work=${WORK}`);
});

it("a supplemental snapshot failure preserves accepted website state and reports the read failure", async () => {
  const { node, tool, release } = await savedWebsite();
  await act(async () => release(Response.json({ error: "Snapshot temporarily unavailable." }, { status: 503 }))); await settle();
  expect(node.querySelector('section[aria-label="Website setup"]')).toBe(tool);
  expect(tool.querySelector('[role="status"]')?.textContent).toBe(NOTICE);
  expect(node.querySelector('[role="alert"]')?.textContent).toContain("Snapshot temporarily unavailable.");
  expect(serverWebsiteTransport.read).toHaveBeenCalledTimes(1);
});

it("a refreshed read-only grant keeps accepted work visible and removes write controls", async () => {
  const { node, tool, release, snapshot } = await savedWebsite();
  const data = await (await snapshot()).json();
  const current = data.workspaces.find((workspace: { id: string }) => workspace.id === BUSINESS);
  current.access = "delegated_read";
  await act(async () => release(Response.json(data))); await settle();
  expect(node.querySelector('section[aria-label="Website setup"]')).toBe(tool);
  expect(tool.textContent).toContain("You can review this website, but this access level cannot change it.");
  expect([...tool.querySelectorAll("button")].some(button => button.textContent?.includes("Prepare launch"))).toBe(false);
});

it("a completed refresh that no longer includes saved work shows unavailable work", async () => {
  const { node, tool, release, snapshot } = await savedWebsite();
  await act(async () => release(await snapshot(BUSINESS, true))); await settle();
  expect(node.contains(tool)).toBe(false);
  expect(node.textContent).toContain("This saved result is unavailable.");
});

it("browser workspace navigation during a save refresh resets the session and rejects the late snapshot", async () => {
  const { node, tool, release, snapshot } = await savedWebsite();
  await act(async () => { window.history.pushState(null, "", `/workspace?workspaceId=${OTHER}`); window.dispatchEvent(new PopStateEvent("popstate")); }); await settle();
  expect(node.contains(tool)).toBe(false);
  expect(new URLSearchParams(window.location.search).get("workspaceId")).toBe(OTHER);
  await act(async () => release(await snapshot())); await settle();
  expect(new URLSearchParams(window.location.search).get("workspaceId")).toBe(OTHER);
  expect(node.querySelector('section[aria-label="Website setup"]')).toBeNull();
});
