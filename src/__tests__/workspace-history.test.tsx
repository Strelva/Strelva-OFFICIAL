// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, prefetch: () => undefined }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));
const { savedCallbacks } = vi.hoisted(() => ({ savedCallbacks: [] as Array<(id: string) => void> }));
// These tests exercise App navigation acknowledgements, not product persistence.
vi.mock("@/experience/workspace/TrackerExperience", () => ({ TrackerExperience: ({ onSaved, readOnly }: { onSaved: (id: string) => void; readOnly?: boolean }) => {
  savedCallbacks.push(onSaved); return <button disabled={readOnly} onClick={() => onSaved("saved-tracker")}>Acknowledge tracker save</button>;
} }));
vi.mock("@/experience/workspace/DocumentExperience", () => ({ DocumentExperience: ({ onSaved, readOnly }: { onSaved: (id: string) => void; readOnly?: boolean }) => {
  savedCallbacks.push(onSaved); return <button disabled={readOnly} onClick={() => onSaved("saved-document")}>Acknowledge document save</button>;
} }));
vi.mock("@/experience/workspace/WorkPlanExperience", () => ({ WorkPlanExperience: ({ onSaved, readOnly }: { onSaved: (id: string) => void; readOnly?: boolean }) => {
  savedCallbacks.push(onSaved); return <button disabled={readOnly} onClick={() => onSaved("saved-plan")}>Acknowledge plan save</button>;
} }));
vi.mock("@/experience/workspace/WorkspaceExperimentResult", () => ({ WorkspaceExperimentResult: ({ onOpenTracker }: { onOpenTracker: (id: string) => void }) => <button onClick={() => onOpenTracker("saved-tracker")}>Open resulting tracker</button> }));
import { WorkspaceApp } from "@/experience/workspace/WorkspaceApp";
import { createPreviewRequest } from "@/experience/workspace/preview/fixture";

import { workspaceReturnTarget } from "@/platform/workspaces/location";

const BUSINESS = "33333333-3333-4333-8333-333333333333";
const INSTALLATION = "77777777-7777-4777-8777-777777777777";
const STAFF_REQUESTS = "88888888-8888-4888-8888-888888888888";

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => {
  sessionStorage.clear();
  savedCallbacks.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  window.scrollTo = () => undefined;
  Element.prototype.scrollTo = () => undefined;
});
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); }
async function render(request: typeof fetch) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => { root.render(<WorkspaceApp request={request} />); });
  await settle();
  return node;
}
async function back() { await act(async () => { window.history.back(); }); await settle(); }
function button(node: HTMLElement, name: string) {
  const found = [...node.querySelectorAll("button")].find(item => item.getAttribute("aria-label") === name || item.textContent?.trim() === name);
  if (!found) throw new Error(`No button named ${name}`);
  return found;
}

describe("leaving a workspace entry never rewrites it", () => {
  it("Back from work opened in an offering returns to that offering", async () => {
    window.history.replaceState(null, "", `/workspace?workspaceId=${BUSINESS}&view=products&offering=${INSTALLATION}`);
    const node = await render(createPreviewRequest("business", { installedStaffRequest: true }));
    await act(async () => button(node, "Open Staff requests").click());
    await settle();
    const opened = new URLSearchParams(window.location.search);
    expect(opened.get("work")).toBe(STAFF_REQUESTS);
    expect(opened.get("view")).toBe("applications");
    expect(opened.has("offering")).toBe(false);

    await back();
    const returned = new URLSearchParams(window.location.search);
    expect(returned.get("view")).toBe("products");
    expect(returned.get("offering")).toBe(INSTALLATION);
  });

  it("opening a product from an offering link moves the URL off the offering, and Back returns to it", async () => {
    const preview = createPreviewRequest("business", { installedStaffRequest: true });
    // Hold the offering list in its loading state so the product rows are what the person can choose.
    const request = ((input: RequestInfo | URL, init?: RequestInit) => new URL(String(input), "https://preview.invalid").pathname === "/api/offerings" ? new Promise<Response>(() => undefined) : preview(input, init)) as typeof fetch;
    window.history.replaceState(null, "", `/workspace?workspaceId=${BUSINESS}&view=products&offering=${INSTALLATION}`);
    const node = await render(request);
    await act(async () => button(node, "Documents: Start").click());
    await settle();
    expect(node.querySelector("h1")?.textContent).toBe("Documents");
    const product = new URLSearchParams(window.location.search);
    expect(product.get("view")).toBe("products");
    expect(product.has("offering")).toBe(false);

    await back();
    expect(new URLSearchParams(window.location.search).get("offering")).toBe(INSTALLATION);
  });
});

it("switching business from a System clears its detail and Back restores the exact entry", async () => {
  const system = "44444444-4444-4444-8444-444444444444";
  const target = `/workspace?workspaceId=${BUSINESS}&view=system&system=${system}`;
  window.history.replaceState({ source: "system" }, "", target);
  const node = await render(createPreviewRequest("business"));
  const select = node.querySelector<HTMLSelectElement>("select");
  expect(select).not.toBeNull();
  await act(async () => {
    select!.value = "11111111-1111-4111-8111-111111111111";
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
  expect(new URLSearchParams(window.location.search).has("system")).toBe(false);
  expect(workspaceReturnTarget(`/workspace${window.location.search}`)).not.toBeNull();
  await back();
  expect(`/workspace${window.location.search}`).toBe(target);
});


function productRequest() {
  const base = createPreviewRequest("business");
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await base(input, init);
    if (new URL(String(input), "https://test.invalid").pathname !== "/api/workspace" || response.status !== 200) return response;
    const data = await response.json();
    data.actor.localPreview = false;
    // Acknowledged fixtures are already retained; product persistence is a separate test surface.
    data.work.push(...[["saved-tracker", "tracker", "tracker"], ["saved-document", "documents", "document"], ["saved-plan", "work_plans", "plan"], ["saved-experiment", "research", "experiment"]].map(([id, productId, resourceKind]) => ({ ...data.work[0], id, productId, resourceKind, assessment: undefined, title: id })));
    return new Response(JSON.stringify(data), { status: 200 });
  }) as typeof fetch;
}

it.each([["tracker", "saved-tracker"], ["document", "saved-document"], ["plan", "saved-plan"]])("an acknowledged %s save replaces creation and Back returns to its previous place", async (view, id) => {
  window.history.replaceState({ origin: "products" }, "", `/workspace?workspaceId=${BUSINESS}&view=products`);
  window.history.pushState({ origin: "start" }, "", `/workspace?workspaceId=${BUSINESS}&view=${view}`);
  const node = await render(productRequest());
  const historyLength = window.history.length;
  await act(async () => button(node, `Acknowledge ${view} save`).click());
  await settle();
  expect(new URLSearchParams(window.location.search).get("work")).toBe(id);
  expect(new URLSearchParams(window.location.search).get("view")).toBe(view);
  expect(window.history.length).toBe(historyLength);
  expect(window.history.state).toMatchObject({ origin: "start" });
  await back();
  expect(new URLSearchParams(window.location.search).get("view")).toBe("products");
});

it.each(["tracker", "document"])("starting a %s leaves all prior System/search/standing detail behind", async view => {
  window.history.replaceState(null, "", `/workspace?workspaceId=${BUSINESS}&view=products&system=44444444-4444-4444-8444-444444444444&search=1&standingId=11111111-1111-4111-8111-111111111111`);
  const node = await render(productRequest());
  // Open the existing product choice before starting its tool.
  const name = view === "tracker" ? "Spreadsheet tracker: Start" : "Documents: Start";
  await act(async () => button(node, name).click());
  await settle();
  await act(async () => button(node, `Start a ${view}`).click());
  await settle();
  const params = new URLSearchParams(window.location.search);
  expect(params.get("view")).toBe(view);
  for (const key of ["system", "search", "standingId", "offering", "work"]) expect(params.has(key)).toBe(false);
});

it("a save callback retained by old work cannot pull a person back after navigating away", async () => {
  window.history.replaceState(null, "", `/workspace?workspaceId=${BUSINESS}&view=document`);
  const node = await render(productRequest());
  const staleSave = savedCallbacks.at(-1)!;
  const home = [...node.querySelectorAll<HTMLAnchorElement>("a")].find(link => link.textContent?.trim() === "Home")!;
  await act(async () => home.click()); await settle();
  const current = window.location.href;
  await act(async () => staleSave("saved-document")); await settle();
  expect(window.location.href).toBe(current);
});

it("a refused workspace switch signs in back to the selected business, without the old System", async () => {
  window.history.replaceState(null, "", `/workspace?workspaceId=${BUSINESS}&view=system&system=44444444-4444-4444-8444-444444444444`);
  const base = createPreviewRequest("business");
  const request = ((input: RequestInfo | URL, init?: RequestInit) => new URL(String(input), "https://test.invalid").searchParams.get("workspaceId") === "11111111-1111-4111-8111-111111111111" ? Promise.resolve(new Response(JSON.stringify({ error: "Sign in again." }), { status: 401 })) : base(input, init)) as typeof fetch;
  const node = await render(request);
  const select = node.querySelector<HTMLSelectElement>("select")!;
  await act(async () => { select.value = "11111111-1111-4111-8111-111111111111"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await settle();
  const link = node.querySelector<HTMLAnchorElement>("a[href^='/sign-in?next=']")!;
  expect(new URL(link.href).searchParams.get("next")).toBe("/workspace?workspaceId=11111111-1111-4111-8111-111111111111");
});

it("agency client work opens a new history entry and Back restores the agency", async () => {
  const agency = "22222222-2222-4222-8222-222222222222";
  window.history.replaceState({ origin: "agency" }, "", `/workspace?workspaceId=${agency}`);
  const base = createPreviewRequest("agency");
  const request = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(String(input), "https://test.invalid").pathname === "/api/workspace/agency-clients") return Promise.resolve(Response.json({
      agencyWorkspaceId: agency, clients: [], team: [], total: 0, nextCursor: null, providersRead: true, queueComplete: true, queueGaps: [],
      queue: [{ id: "saved-assessment", kind: "request", workspaceId: BUSINESS, clientName: "Harbor Dental", title: "Open saved assessment", systemId: null, workId: "44444444-4444-4444-8444-444444444444", since: "2026-10-08T12:00:00.000Z" }],
    }));
    const response = await base(input, init);
    if (new URL(String(input), "https://test.invalid").pathname !== "/api/workspace") return response;
    const data = await response.json();
    return Response.json({ ...data, releases: { ...data.releases, systems: true } });
  }) as typeof fetch;
  const node = await render(request);
  const tab = [...node.querySelectorAll<HTMLButtonElement>("[role='tab']")].find(item => item.textContent?.startsWith("Queue"))!;
  expect(tab).toBeDefined();
  await act(async () => tab.click()); await settle();
  const open = node.querySelector<HTMLButtonElement>("button[aria-label^='Open saved assessment']")!;
  expect(open).not.toBeNull();
  await act(async () => open.click()); await settle();
  expect(new URLSearchParams(window.location.search).get("workspaceId")).toBe(BUSINESS);
  expect(new URLSearchParams(window.location.search).get("work")).toBe("44444444-4444-4444-8444-444444444444");
  await back();
  expect(new URLSearchParams(window.location.search).get("workspaceId")).toBe(agency);
  expect(new URLSearchParams(window.location.search).has("work")).toBe(false);
});

it("opening a resulting tracker preserves the experiment entry for Back", async () => {
  window.history.replaceState(null, "", `/workspace?workspaceId=${BUSINESS}&view=work&work=saved-experiment`);
  const node = await render(productRequest());
  await act(async () => button(node, "Open resulting tracker").click()); await settle();
  expect(new URLSearchParams(window.location.search).get("work")).toBe("saved-tracker");
  expect(new URLSearchParams(window.location.search).get("view")).toBe("tracker");
  await back();
  expect(new URLSearchParams(window.location.search).get("work")).toBe("saved-experiment");
});

it("a foreign public-save response cannot navigate into another business", async () => {
  window.history.replaceState(null, "", `/workspace?workspaceId=${BUSINESS}&save=scan_public123`);
  const base = createPreviewRequest("business");
  const request = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method !== "POST") return base(input, init);
    const data = await (await base(`/api/workspace?workspaceId=${BUSINESS}`)).json();
    return Response.json({ work: { ...data.work[0], workspaceId: "11111111-1111-4111-8111-111111111111" } });
  }) as typeof fetch;
  const node = await render(request);
  const save = [...node.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.includes("Save a copy"))!;
  expect(save).toBeDefined();
  await act(async () => save.click()); await settle();
  expect(node.textContent).toContain("The saved result could not be confirmed for this workspace.");
  expect(new URLSearchParams(window.location.search).get("workspaceId")).toBe(BUSINESS);
  expect(new URLSearchParams(window.location.search).get("save")).toBe("scan_public123");
});
