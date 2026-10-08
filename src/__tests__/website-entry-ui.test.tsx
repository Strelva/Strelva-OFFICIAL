// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebsiteEntry } from "@/experience/websites/WebsiteEntry";
import { managedSiteNavigation, websiteEntryPath } from "@/experience/websites/site-navigation";
import { WorkspaceSitePreview } from "@/experience/websites/WorkspaceSitePreview";
import { WebsiteCutoverUndo, WebsiteDomainRequest } from "@/experience/websites/WebsiteRecoveryControls";
import { fixtureRebuild } from "@/experience/websites/rebuild-fixture";
import type { RebuildTransport } from "@/experience/websites/rebuild-transport";
import { workspaceReturnTarget } from "@/platform/workspaces/location";

const WS = "11111111-1111-4111-8111-111111111111";
let root: Root | undefined;
let node: HTMLDivElement;
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; node?.remove(); vi.unstubAllGlobals(); });
async function mount(element: ReturnType<typeof createElement>) {
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
  await act(async () => root!.render(element));
}
async function input(element: HTMLInputElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); });
}
const button = (name: string) => [...node.querySelectorAll("button")].find(item => item.textContent?.trim() === name)!;

describe("independently released website entry", () => {
  it("chooses neither path when both are available and hides disabled paths", () => {
    const render = (connectedEnabled: boolean, rebuildEnabled: boolean, requested: string | null) => renderToStaticMarkup(createElement(WebsiteEntry, { workspaceId: WS, connectedEnabled, rebuildEnabled, path: websiteEntryPath(connectedEnabled, rebuildEnabled, requested), canManage: true }));
    const both = render(true, true, null);
    expect(both).toContain("Connect your existing website"); expect(both).toContain("Prepare a new website"); expect(both).not.toContain("<form");
    expect(render(false, false, null)).not.toContain("<form");
    const connect = render(true, false, null);
    expect(connect).toContain("Get my two lines"); expect(connect).not.toContain("Prepare a new website");
    const rebuild = render(false, true, null);
    expect(rebuild).toContain("Your current website"); expect(rebuild).not.toContain("Get my two lines");
    expect(render(false, true, "connect")).not.toContain("<form");
    expect(render(true, false, "rebuild")).not.toContain("<form");
  });
  it("preserves each safe entry and saved rebuild through sign-in without accepting mixed or foreign redirects", () => {
    for (const query of ["", "&entry=connect", "&entry=rebuild", `&entry=rebuild&workId=${fixtureRebuild().workId}`]) {
      const target = `/workspace/site?workspaceId=${WS}${query}`;
      expect(workspaceReturnTarget(target)).toBe(target);
    }
    for (const query of ["&entry=other", "&entry=connect&entry=rebuild", "&entry=rebuild&workId=../../foreign", `&entry=connect&workId=${fixtureRebuild().workId}`, "&next=https://foreign.test", "&tab=edit"]) expect(workspaceReturnTarget(`/workspace/site?workspaceId=${WS}${query}`)).toBeNull();
  });
  it("keeps failed source inputs and lets an owner submit intake without exposing publishing", async () => {
    const record = fixtureRebuild();
    const start = vi.fn(async () => { throw new Error("We couldn't open that website."); });
    const transport: RebuildTransport = { start, read: async () => record, mutate: vi.fn(async () => record) };
    await mount(createElement(WebsiteEntry, { workspaceId: WS, connectedEnabled: false, rebuildEnabled: true, path: "rebuild", canManage: true, transport }));
    const field = node.querySelector("input")!;
    await input(field, "https://synthetic.example.test");
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("couldn't open"); expect(field.value).toBe("https://synthetic.example.test");
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WS, url: "https://synthetic.example.test", requestId: expect.any(String) }));
    expect(node.textContent).not.toContain("Publish approved website");
  });
  it("reopens persisted work for managed owner review and disables member intake", async () => {
    const record = fixtureRebuild(); record.approved = true; record.status = "approved";
    const read = vi.fn(async () => record);
    const transport: RebuildTransport = { read, start: vi.fn(async () => record), mutate: vi.fn(async () => record) };
    await mount(createElement(WebsiteEntry, { workspaceId: WS, connectedEnabled: true, rebuildEnabled: true, path: "rebuild", canManage: true, initialWorkId: record.workId, rebuilds: [record], transport }));
    expect(read).toHaveBeenCalledWith(WS, record.workId, expect.any(AbortSignal));
    expect(node.textContent).toContain("Strelva will handle launch and your domain."); expect(node.textContent).not.toContain("Publish approved website");
    await act(async () => root!.render(createElement(WebsiteEntry, { key: "member", workspaceId: WS, connectedEnabled: false, rebuildEnabled: true, path: "rebuild", canManage: false, transport })));
    expect(button("Build a private preview").disabled).toBe(true);
  });
});

describe("managed owners request and review", () => {
  it.each(["owner", "admin", "member"] as const)("does not render editor tabs or direct editing for %s, even on an editor deep link", role => {
    const html = renderToStaticMarkup(createElement(WorkspaceSitePreview, { kind: "native", role, tab: "edit", state: "ready" }));
    expect(html).toContain('data-tab="request"'); expect(html).toContain("Ask for a change");
    for (const tab of ["edit", "look", "photos", "collections", "google"]) expect(html).not.toContain(`tab=${tab}`);
    expect(html).not.toContain("Dried fruit, done right.");
  });
  it("keeps operators' native tools and requires Requests for repo-only edits", () => {
    expect(managedSiteNavigation("native", true, "edit").tab).toBe("edit");
    expect(managedSiteNavigation("request", true, "edit").tab).toBe("request");
    expect(managedSiteNavigation("native", false, "source").tab).toBe("request");
  });
});

describe("domain and cutover recovery decisions", () => {
  it("prepares the exact hostname request and preserves server refusal", async () => {
    const request = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ error: "Not an operator" }), { status: 403 }));
    await mount(createElement(WebsiteDomainRequest, { workId: fixtureRebuild().workId, request }));
    await input(node.querySelector("input")!, "www.synthetic.example.test");
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ domain: "www.synthetic.example.test", requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("Not an operator"); expect(node.querySelector("input")?.value).toBe("www.synthetic.example.test");
  });
  it("requires both manual recovery confirmations, pins the candidate, and retains a retryable refusal", async () => {
    const record = fixtureRebuild("published"); record.tenantId = "tenant-zero";
    const request = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ error: "Fallback could not be verified" }), { status: 409 }));
    await mount(createElement(WebsiteCutoverUndo, { record, request }));
    expect(button("Restore previous website").disabled).toBe(true);
    const checks = [...node.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    await act(async () => checks[0]!.click()); expect(button("Restore previous website").disabled).toBe(true);
    await act(async () => checks[1]!.click());
    await act(async () => button("Restore previous website").click());
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({ tenantId: "tenant-zero", candidateRevision: record.candidate!.revision, candidateContentHash: record.candidate!.contentHash, commandId: expect.stringMatching(/^[0-9a-f-]{36}$/), domainRestored: true, fallbackVerified: true });
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("Fallback could not be verified"); expect(checks.every(item => item.checked)).toBe(true);
    request.mockResolvedValueOnce(new Response(JSON.stringify({ receipt: { kind: "linked_cutover_undone" } }), { status: 200 }));
    await act(async () => button("Restore previous website").click());
    expect(node.textContent).toContain("undo receipt is saved in history");
  });
});
