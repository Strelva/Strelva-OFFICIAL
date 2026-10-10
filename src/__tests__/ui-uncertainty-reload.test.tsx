// @vitest-environment jsdom
import { act, createElement } from "react";
import { createHash, randomUUID } from "node:crypto";
import { systemOriginId } from "@/platform/systems/invariants";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConnectSiteExperience, type ConnectableSite } from "@/experience/connected-sites/ConnectSiteExperience";
import { ServerVisibility } from "@/experience/connected-sites/ServerVisibility";
import { WebsiteChangeRequests } from "@/experience/websites/WebsiteChangeRequests";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { createBusinessPagesStore } from "@/products/connected-sites/business-pages-store";
import { workspaceHttpFailure } from "@/platform/workspaces/http";
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => null }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: vi.fn() }));
const BUSINESS = "11111111-1111-4111-8111-111111111111";
const SYSTEM = "22222222-2222-4222-8222-222222222222";
const REQUEST = "33333333-3333-4333-8333-333333333333";
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Real SHA-256 bytes; a synchronous resolved digest keeps DOM fixtures deterministic.
  vi.stubGlobal("crypto", { randomUUID, subtle: { digest: async (_algorithm: string, bytes: Uint8Array) => Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer } });
});
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function mount(element: ReturnType<typeof createElement>, request: typeof fetch) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, element)));
  return node;
}
function reloadSpy() {
  const reload = vi.fn(), original = window;
  vi.stubGlobal("window", new Proxy(original, { get(target, key) { return key === "location" ? { reload } : Reflect.get(target, key, target); } }));
  return reload;
}
async function fill(node: HTMLElement, text: string) {
  const field = node.querySelector("input")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, text); field.dispatchEvent(new Event("input", { bubbles: true })); });
}
const button = (node: HTMLElement, text: string) => [...node.querySelectorAll("button")].find(item => item.textContent === text);
const pageElement = () => createElement(ServerVisibility, { workspaceId: BUSINESS, canManage: true, suggestedHandle: "bread", initial: { pagesEnabled: true, page: null, blocks: null } });

it.each([false, true])("gives an uncertain connection an actual reload action without overriding outside focus (outside: %s)", async outside => {
  let finish!: () => void;
  const pending = new Promise<Response>((_resolve, reject) => { finish = () => reject(new TypeError("Reply lost")); });
  const request = vi.fn(async () => pending), reload = reloadSpy();
  const node = await mount(createElement(ConnectSiteExperience, { workspaceId: BUSINESS, canManage: true, initialSites: [] }), request as unknown as typeof fetch);
  await fill(node, "bakery.example");
  const trigger = button(node, "Get my two lines")!; trigger.focus();
  await act(async () => { trigger.click(); });
  const elsewhere = document.createElement("button"); document.body.appendChild(elsewhere);
  if (outside) elsewhere.focus();
  await act(async () => finish());
  const recover = button(node, "Reload connection"); expect(recover).toBeTruthy();
  expect(document.activeElement).toBe(outside ? elsewhere : recover);
  await act(async () => recover!.click());
  expect(reload).toHaveBeenCalledTimes(1); expect(request).toHaveBeenCalledTimes(1);
});

it("reloads uncertain receipts without replaying the recorded decision", async () => {
  const reload = reloadSpy();
  const preview = { id: "66666666-6666-4666-8666-666666666666", kind: "preview", previewUrl: "https://preview.example.test", commitSha: null, deploymentUrl: null, readBack: null, note: null, recordedAt: "2026-10-09T00:00:00Z" };
  const request = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") throw new TypeError("Receipt response lost");
    return new Response(JSON.stringify({ requests: [{ id: REQUEST, request: "Change the site", status: "requested", accepted: "pending", createdAt: "2026-10-09T00:00:00Z", updatedAt: "2026-10-09T00:00:00Z", receipts: [preview] }] }));
  });
  const node = await mount(createElement(WebsiteChangeRequests, { workspaceId: BUSINESS, systemId: SYSTEM, siteLabel: "Bakery", editing: "request", canAsk: false, canDecide: true, operator: false }), request as unknown as typeof fetch);
  const approve = button(node, "Approve the preview")!; approve.focus();
  await act(async () => approve.click());
  const recover = button(node, "Reload receipts"); expect(recover).toBeTruthy(); expect(document.activeElement).toBe(recover);
  await act(async () => recover!.click()); expect(reload).toHaveBeenCalledTimes(1);
  expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});

it("locks an actual post-RPC page parse failure mapped to400 and exposes reload with focus", async () => {
  let committed = false;
  const store = createBusinessPagesStore({ rpc: async name => { expect(name).toBe("set_business_page"); committed = true; return { data: { handle: "bread", published: true, publishedAt: null }, error: null }; } });
  let response!: Response;
  try { await store.set({ userId: SYSTEM, verifiedEmail: "owner@example.test" }, BUSINESS, { handle: "bread", published: true }); throw new Error("Expected decode failure"); }
  catch (error) { response = workspaceHttpFailure(error); }
  expect(committed).toBe(true); expect(response.status).toBe(400);
  const request = vi.fn(async () => response), reload = reloadSpy();
  const node = await mount(pageElement(), request as unknown as typeof fetch);
  const publish = button(node, "Publish page")!; publish.focus();
  await act(async () => publish.click());
  expect(publish.disabled).toBe(true); expect(node.querySelector("input")?.readOnly).toBe(true);
  expect(node.querySelector('[role="alert"]')?.textContent).toContain("couldn't confirm");
  const recover = button(node, "Reload page"); expect(recover).toBeTruthy(); expect(document.activeElement).toBe(recover);
  await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => recover!.click()); expect(reload).toHaveBeenCalledTimes(1); expect(request).toHaveBeenCalledTimes(1);
});

it("admits one page mutation during same-batch submits", async () => {
  let finish!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => { finish = resolve; });
  const request = vi.fn(async () => pending);
  const node = await mount(pageElement(), request as unknown as typeof fetch);
  await act(async () => { node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => finish(new Response(JSON.stringify({ page: { handle: "bread", published: true, url: "https://app.strelva.com/biz/bread" } }))));
});

const connection: ConnectableSite = { id: REQUEST, systemId: systemOriginId(BUSINESS, { kind: "connected_site", ref: REQUEST }), siteHost: "bakery.example", siteUrl: "https://bakery.example/", status: "active", verifiedAt: null, snippet: { script: "<script></script>", meta: null } };
it("rejects a valid connection acknowledgement for another submitted address", async () => {
  const request = vi.fn(async () => new Response(JSON.stringify({ site: connection }), { status: 201 }));
  const node = await mount(createElement(ConnectSiteExperience, { workspaceId: BUSINESS, canManage: true, initialSites: [] }), request as unknown as typeof fetch);
  await fill(node, "another.example");
  await act(async () => button(node, "Get my two lines")!.click());
  expect(node.textContent).not.toContain("Add these two lines to bakery.example");
  expect(button(node, "Reload connection")).toBeTruthy();
  expect(node.querySelector("input")?.readOnly).toBe(true);
  await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(request).toHaveBeenCalledTimes(1);
});
it.each([
  ["HTTPS://WWW.BAKERY.EXAMPLE.:443/menu?preview=1#top", "https://www.bakery.example./menu", "www.bakery.example"],
  ["https://bakery.example:8443/menu", "https://bakery.example:8443/menu", "bakery.example"],
  ["http://test.localhost:3100/", "http://test.localhost:3100/", "test.localhost"],
])("matches the stored canonical URL and host for %s", async (input, siteUrl, siteHost) => {
  const request = vi.fn(async () => new Response(JSON.stringify({ site: { ...connection, siteUrl, siteHost } }), { status: 201 }));
  const node = await mount(createElement(ConnectSiteExperience, { workspaceId: BUSINESS, canManage: true, initialSites: [] }), request as unknown as typeof fetch);
  await fill(node, input);
  await act(async () => button(node, "Get my two lines")!.click());
  expect(node.textContent).toContain(`Add these two lines to ${siteHost}`);
  expect(button(node, "Reload connection")).toBeUndefined();
});
it("keeps unknown publication locked and visible while a read-only site check completes", async () => {
  const request = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return body.action === "page" ? new Response('{"error":"Saved row could not be read"}', { status: 400 }) : new Response(JSON.stringify({ check: { siteId: REQUEST, status: "current" } }));
  });
  const props = { workspaceId: BUSINESS, canManage: true, suggestedHandle: "bread", initial: { pagesEnabled: true, page: null, blocks: [{ id: REQUEST, label: "Bakery", url: "https://bakery.example", checkable: true, block: { hash: "abc", html: "<script></script>" } }] } };
  const node = await mount(createElement(ServerVisibility, props), request as unknown as typeof fetch);
  await act(async () => button(node, "Publish page")!.click());
  await act(async () => button(node, "Check Bakery")!.click());
  expect(node.textContent).toContain("matches the confirmed details");
  expect(node.querySelector('[role="alert"]')?.textContent).toContain("couldn't confirm");
  expect(button(node, "Reload page")).toBeTruthy(); expect(button(node, "Publish page")?.disabled).toBe(true);
  expect(request).toHaveBeenCalledTimes(2);
});
it("keeps an uncertain unpublish decision locked through a later submit", async () => {
  const request = vi.fn(async (_url: string, _init?: RequestInit) => { throw new TypeError("Reply lost"); });
  const node = await mount(createElement(ServerVisibility, { workspaceId: BUSINESS, canManage: true, initial: { pagesEnabled: true, page: { handle: "bread", published: true, url: "https://app.strelva.com/biz/bread" }, blocks: null } }), request as unknown as typeof fetch);
  await act(async () => button(node, "Unpublish")!.click());
  expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body)).published).toBe(false);
  expect(button(node, "Unpublish")?.disabled).toBe(true); expect(button(node, "Save address")?.disabled).toBe(true);
  await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(request).toHaveBeenCalledTimes(1); expect(button(node, "Reload page")).toBeTruthy();
});
it("does not attach an old page flight or its recovery focus to a newly selected business", async () => {
  let finish!: () => void;
  const pending = new Promise<Response>((_resolve, reject) => { finish = () => reject(new TypeError("Reply lost")); });
  const request = vi.fn(async () => pending);
  const node = await mount(pageElement(), request as unknown as typeof fetch);
  const publish = button(node, "Publish page")!; publish.focus();
  await act(async () => publish.click());
  const next = createElement(ServerVisibility, { workspaceId: SYSTEM, canManage: true, suggestedHandle: "other", initial: { pagesEnabled: true, page: null, blocks: null } });
  await act(async () => roots[roots.length - 1]!.render(createElement(WorkspaceRequestContext.Provider, { value: request as unknown as typeof fetch }, next)));
  const current = button(node, "Publish page")!; current.focus();
  await act(async () => finish());
  expect(node.querySelector("input")?.value).toBe("other"); expect(current.disabled).toBe(false);
  expect(button(node, "Reload page")).toBeUndefined(); expect(document.activeElement).toBe(current);
  expect(request).toHaveBeenCalledTimes(1);
});
it.each([false, true])("recovers a completed connection to its instructions without overriding outside focus (outside: %s)", async outside => {
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { finish = resolve; });
  const request = vi.fn(async () => pending);
  const node = await mount(createElement(ConnectSiteExperience, { workspaceId: BUSINESS, canManage: true, initialSites: [] }), request as unknown as typeof fetch);
  await fill(node, "bakery.example");
  const trigger = button(node, "Get my two lines")!; trigger.focus();
  await act(async () => trigger.click());
  const elsewhere = document.createElement("button"); document.body.appendChild(elsewhere); if (outside) elsewhere.focus();
  await act(async () => finish(new Response(JSON.stringify({ site: connection }), { status: 201 })));
  expect(node.querySelector("h2")?.textContent).toBe("Add these two lines to bakery.example");
  expect(document.activeElement).toBe(outside ? elsewhere : node.querySelector("h2"));
});
it.each([false, true])("recovers a completed verification to its connected result without overriding outside focus (outside: %s)", async outside => {
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { finish = resolve; });
  const request = vi.fn(async () => pending);
  const node = await mount(createElement(ConnectSiteExperience, { workspaceId: BUSINESS, canManage: true, initialSites: [connection] }), request as unknown as typeof fetch);
  const trigger = button(node, "Check my site")!; trigger.focus();
  await act(async () => trigger.click());
  const elsewhere = document.createElement("button"); document.body.appendChild(elsewhere); if (outside) elsewhere.focus();
  await act(async () => finish(new Response(JSON.stringify({ site: { ...connection, verifiedAt: "2026-10-09T00:00:00Z" } }))));
  expect(node.querySelector("h2")?.textContent).toBe("bakery.example is connected");
  expect(document.activeElement).toBe(outside ? elsewhere : node.querySelector("h2"));
});

it.each(["https://app.strelva.com/b/bread", "https://app.strelva.com/biz/other", "https://foreign.example/biz/bread", "https://app.strelva.com/biz/bread?changed=1", "https://app.strelva.com/biz/bread#different"])("locks a schema-valid publication acknowledgement with the wrong URL %s", async url => {
  const request = vi.fn(async () => new Response(JSON.stringify({ page: { handle: "bread", published: true, url } })));
  const reload = reloadSpy(), node = await mount(pageElement(), request as unknown as typeof fetch);
  await act(async () => button(node, "Publish page")!.click());
  expect(button(node, "Reload page")).toBeTruthy();
  expect(button(node, "Publish page")?.disabled).toBe(true);
  expect(node.querySelector('a[href="' + url + '"]')).toBeNull();
  await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => button(node, "Reload page")!.click());
  expect(request).toHaveBeenCalledTimes(1); expect(reload).toHaveBeenCalledTimes(1);
});
it.each(["connect", "verify"])("locks a schema-valid %s acknowledgement for an unrelated System", async action => {
  const request = vi.fn(async () => new Response(JSON.stringify({ site: { ...connection, systemId: SYSTEM, verifiedAt: "2026-10-09T00:00:00Z" } })));
  const reload = reloadSpy(), node = await mount(createElement(ConnectSiteExperience, { workspaceId: BUSINESS, canManage: true, initialSites: action === "verify" ? [connection] : [] }), request as unknown as typeof fetch);
  if (action === "connect") await fill(node, "bakery.example");
  await act(async () => button(node, action === "connect" ? "Get my two lines" : "Check my site")!.click());
  expect(button(node, "Reload connection")).toBeTruthy();
  expect(node.textContent).not.toContain("bakery.example is connected");
  expect(node.querySelector(`a[href*="system=${SYSTEM}"]`)).toBeNull();
  await act(async () => button(node, "Reload connection")!.click());
  expect(request).toHaveBeenCalledTimes(1); expect(reload).toHaveBeenCalledTimes(1);
});
it("locks a verification acknowledgement with the right IDs but another address", async () => {
  const request = vi.fn(async () => new Response(JSON.stringify({ site: { ...connection, siteUrl: "https://other.example/", siteHost: "other.example", verifiedAt: "2026-10-09T00:00:00Z" } })));
  const node = await mount(createElement(ConnectSiteExperience, { workspaceId: BUSINESS, canManage: true, initialSites: [connection] }), request as unknown as typeof fetch);
  await act(async () => button(node, "Check my site")!.click());
  expect(button(node, "Reload connection")).toBeTruthy(); expect(node.textContent).not.toContain("other.example is connected");
});
