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
import { RebuildUnconfirmedError, type RebuildTransport, type RebuildView } from "@/experience/websites/rebuild-transport";
import { requestDraftKey, writeRequestDraft, readRequestDraft } from "@/experience/workspace/request-draft";
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
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("Check this same request"); expect(field.value).toBe("https://synthetic.example.test");
    expect(field.disabled).toBe(true);
    expect(button("Check this website request")).toBeDefined();
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WS, url: "https://synthetic.example.test", requestId: expect.any(String) }));
    expect(node.textContent).not.toContain("Publish approved website");
  });
  it("reopens persisted work for managed owner review and disables member intake", async () => {
    const record = fixtureRebuild(); record.approved = true; record.status = "approved";
    const read = vi.fn(async () => record);
    const transport: RebuildTransport = { read, start: vi.fn(async () => record), mutate: vi.fn(async () => record) };
    await mount(createElement(WebsiteEntry, { workspaceId: WS, connectedEnabled: true, rebuildEnabled: true, path: "rebuild", canManage: true, initialWorkId: record.workId, rebuilds: [record], transport }));
    expect(read).toHaveBeenCalledWith(WS, record.workId, expect.any(AbortSignal));
    expect(node.textContent).toContain("No agency publication authority is shown here."); expect(node.textContent).not.toContain("Publish approved website");
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
  it("requires both manual confirmations, pins the command, and explicitly checks its exact receipt", async () => {
    const record = fixtureRebuild("published"); record.tenantId = "tenant-zero";
    const request = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ error: "Fallback could not be verified" }), { status: 409 }));
    await mount(createElement(WebsiteCutoverUndo, { record, request }));
    expect(button("Restore previous website").disabled).toBe(true);
    const checks = [...node.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    await act(async () => checks[0]!.click()); expect(button("Restore previous website").disabled).toBe(true);
    await act(async () => checks[1]!.click());
    await act(async () => button("Restore previous website").click());
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({ workspaceId: record.workspaceId, tenantId: "tenant-zero", candidateRevision: record.candidate!.revision, candidateContentHash: record.candidate!.contentHash, commandId: expect.stringMatching(/^[0-9a-f-]{36}$/), domainRestored: true, fallbackVerified: true });
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("Fallback could not be verified"); expect(checks.every(item => item.checked)).toBe(true);
    const captured = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    request.mockResolvedValueOnce(Response.json({ receipt: { kind: "rebuild_cutover_undone", receiptId: captured.commandId, tenantId: captured.tenantId, tenantStableId: "62000000-0000-4000-8000-000000000113", workId: record.workId, revision: captured.candidateRevision, contentHash: captured.candidateContentHash, restoredBy: "62000000-0000-4000-8000-000000000101", restoredAt: "2026-10-09T00:00:00Z", deliveryModel: "custom_repo", domainRestored: true, fallbackVerified: true } }));
    expect(button("Restore previous website").disabled).toBe(true);
    await act(async () => button("Check this undo command").click());
    expect(request.mock.calls[1]?.[1]?.body).toBe(request.mock.calls[0]?.[1]?.body);
    expect(node.textContent).toContain("undo receipt for website version 1 is saved");
  });
});

it("carries the same-tab business request into canonical website intake without deleting it or touching another actor's draft", async () => {
  const actorEmail = "draft-owner@example.test";
  const key = requestDraftKey({ actorEmail, workspaceId: WS });
  writeRequestDraft(window.sessionStorage, key, "Make a website for our second office.");
  const foreign = requestDraftKey({ actorEmail: "other@example.test", workspaceId: WS });
  writeRequestDraft(window.sessionStorage, foreign, "Another actor's private request.");
  await mount(createElement(WebsiteEntry, { workspaceId: WS, actorEmail, connectedEnabled: false, rebuildEnabled: true, path: "rebuild", canManage: true }));
  expect([...node.querySelectorAll("textarea")].map(field => field.value)).toContain("Make a website for our second office.");
  expect(node.textContent).not.toContain("Another actor's private request.");
  expect(readRequestDraft(window.sessionStorage, key)).toBe("Make a website for our second office.");
  window.sessionStorage.removeItem(key); window.sessionStorage.removeItem(foreign);
});


describe("saved website navigation reflects current records", () => {
  function current(status: RebuildView["status"], revision = 18, workId = fixtureRebuild().workId): RebuildView {
    return { ...fixtureRebuild(), workspaceId: WS, workId, title: "Fictional bakery", status, revision, approved: status === "approved" || status === "published" };
  }
  const selectedLabel = () => node.querySelector("select")!.selectedOptions[0]!.textContent;
  const props = (transport: RebuildTransport, record: RebuildView) => ({ workspaceId: WS, connectedEnabled: false, rebuildEnabled: true, path: "rebuild" as const, canManage: true, initialWorkId: record.workId, rebuilds: [record], transport });
  function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }

  it("updates the stale building label from the current ready-for-review read without navigating or moving focus", async () => {
    const old = current("building", 0); const loaded = current("review"); const pending = deferred<RebuildView>();
    const read = vi.fn(() => pending.promise); const transport: RebuildTransport = { read, start: vi.fn(), mutate: vi.fn() };
    await mount(createElement(WebsiteEntry, props(transport, old)));
    const select = node.querySelector("select")!; select.focus(); const href = window.location.href;
    const replace = vi.spyOn(window.history, "replaceState");
    await act(async () => pending.resolve(loaded));
    expect(selectedLabel()).toBe("Fictional bakery · review");
    expect(read).toHaveBeenCalledWith(WS, old.workId, expect.any(AbortSignal)); expect(read).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(select); expect(window.location.href).toBe(href); expect(replace).not.toHaveBeenCalled(); replace.mockRestore();
  });

  it("keeps actual published work published rather than inferring draft state from its private preview", async () => {
    const old = current("building", 0); const published = current("published", 24);
    const transport: RebuildTransport = { read: vi.fn(async () => published), start: vi.fn(), mutate: vi.fn() };
    await mount(createElement(WebsiteEntry, props(transport, old)));
    expect(selectedLabel()).toBe("Fictional bakery · published");
    expect(node.textContent).toContain("This revision has been published.");
  });

  it("retains the acknowledged creation view when navigation remounts before a failed saved-state read", async () => {
    const created = current("review", 18);
    const start = vi.fn(async () => created); const read = vi.fn(async () => { throw new Error("The saved website could not be read."); });
    const transport: RebuildTransport = { start, read, mutate: vi.fn() };
    await mount(createElement(WebsiteEntry, { workspaceId: WS, connectedEnabled: false, rebuildEnabled: true, path: "rebuild", canManage: true, transport }));
    await input(node.querySelector("input")!, "https://fictional.example.test");
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(start).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledWith(WS, created.workId, expect.any(AbortSignal));
    expect(selectedLabel()).toBe("Fictional bakery · review"); expect(node.querySelector("select")!.value).toBe(created.workId); expect(node.querySelector('[role="alert"]')?.textContent).toContain("could not be read");
    expect(node.querySelector("select")!.options).toHaveLength(2);
  });

  it("updates the option after a saved decision without adding navigation or resetting the selected control", async () => {
    const old = current("review", 18); const next = { ...current("review", 19), title: "Corrected fictional bakery" };
    const mutate = vi.fn(async () => next); const transport: RebuildTransport = { read: vi.fn(async () => old), start: vi.fn(), mutate };
    await mount(createElement(WebsiteEntry, props(transport, old)));
    const select = node.querySelector("select")!; select.focus(); const replace = vi.spyOn(window.history, "replaceState");
    await act(async () => button("Confirm").click());
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WS, workId: old.workId, revision: 18 }), "confirm", expect.objectContaining({ factId: expect.any(String) }));
    expect(selectedLabel()).toBe("Corrected fictional bakery · review"); expect(node.querySelector("select")).toBe(select); expect(document.activeElement).toBe(select);
    expect(replace).toHaveBeenCalledTimes(1); replace.mockRestore();
  });

  it("updates from the explicit current-state recovery read and never derives approval from the failed mutation", async () => {
    const old = current("review", 18); const approved = current("approved", 20);
    const read = vi.fn().mockResolvedValueOnce(old).mockResolvedValueOnce(approved);
    const mutate = vi.fn(async () => { throw new RebuildUnconfirmedError(); });
    const transport: RebuildTransport = { read, start: vi.fn(), mutate };
    await mount(createElement(WebsiteEntry, props(transport, old)));
    await act(async () => button("Confirm").click()); expect(selectedLabel()).toBe("Fictional bakery · review");
    const replace = vi.spyOn(window.history, "replaceState");
    await act(async () => button("Reload current state").click());
    expect(selectedLabel()).toBe("Fictional bakery · approved"); expect(read).toHaveBeenLastCalledWith(WS, old.workId); expect(mutate).toHaveBeenCalledTimes(1); expect(replace).not.toHaveBeenCalled(); replace.mockRestore();
  });

  it("does not roll the saved option backward when an older view arrives", async () => {
    const saved = current("published", 24); const old = current("review", 18);
    const transport: RebuildTransport = { read: vi.fn(async () => old), start: vi.fn(), mutate: vi.fn() };
    await mount(createElement(WebsiteEntry, props(transport, saved)));
    expect(selectedLabel()).toBe("Fictional bakery · published");
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("The current saved website could not be confirmed");
    expect(node.textContent).not.toContain("Resolve the flagged facts before approving.");
  });

  it("can explicitly retry a refused lower initial read and adopt a newer current private revision", async () => {
    const saved = current("published", 24); const newer = current("review", 25);
    const read = vi.fn().mockResolvedValueOnce(current("review", 18)).mockResolvedValueOnce(newer);
    const transport: RebuildTransport = { read, start: vi.fn(), mutate: vi.fn() };
    await mount(createElement(WebsiteEntry, props(transport, saved)));
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("could not be confirmed");
    const select = node.querySelector("select")!; select.focus(); const replace = vi.spyOn(window.history, "replaceState");
    await act(async () => button("Try loading again").click());
    expect(selectedLabel()).toBe("Fictional bakery · review"); expect(node.querySelector('[role="alert"]')).toBeNull();
    expect(node.textContent).toContain("Resolve the flagged facts before approving."); expect(read).toHaveBeenCalledTimes(2); expect(document.activeElement).toBe(select); expect(replace).not.toHaveBeenCalled(); replace.mockRestore();
  });

  it("refuses a lower progress view before adoption and continues to a newer current read", async () => {
    vi.useFakeTimers();
    try {
      const building = { ...current("building", 1), candidate: null };
      const newerBuilding = { ...building, revision: 3, title: "Current build title" };
      const read = vi.fn().mockResolvedValueOnce(building).mockResolvedValueOnce(newerBuilding).mockResolvedValueOnce({ ...building, revision: 2, title: "Stale build title" }).mockResolvedValueOnce(current("review", 4));
      const transport: RebuildTransport = { read, start: vi.fn(), mutate: vi.fn() };
      await mount(createElement(WebsiteEntry, props(transport, building)));
      await act(async () => vi.advanceTimersByTimeAsync(2500));
      expect(selectedLabel()).toBe("Current build title · building");
      await act(async () => vi.advanceTimersByTimeAsync(2500));
      expect(node.querySelector('[role="alert"]')?.textContent).toContain("could not be confirmed");
      expect(selectedLabel()).toBe("Current build title · building"); expect(node.textContent).not.toContain("Stale build title");
      await act(async () => vi.advanceTimersByTimeAsync(2500));
      expect(selectedLabel()).toBe("Fictional bakery · review"); expect(node.querySelector('[role="alert"]')).toBeNull(); expect(read).toHaveBeenCalledTimes(4);
    } finally { vi.useRealTimers(); }
  });

  it("refuses a foreign progress view without raising the known revision for the selected work", async () => {
    vi.useFakeTimers();
    try {
      const building = { ...current("building", 1), candidate: null };
      const foreign = { ...current("review", 99, "55555555-5555-4555-8555-555555555555"), title: "Foreign progress title" };
      const read = vi.fn().mockResolvedValueOnce(building).mockResolvedValueOnce(foreign).mockResolvedValueOnce(current("review", 2));
      const transport: RebuildTransport = { read, start: vi.fn(), mutate: vi.fn() };
      await mount(createElement(WebsiteEntry, props(transport, building)));
      await act(async () => vi.advanceTimersByTimeAsync(2500));
      expect(node.querySelector('[role="alert"]')?.textContent).toContain("could not be confirmed"); expect(node.textContent).not.toContain("Foreign progress title"); expect(selectedLabel()).toBe("Fictional bakery · building");
      await act(async () => vi.advanceTimersByTimeAsync(2500));
      expect(selectedLabel()).toBe("Fictional bakery · review"); expect(node.querySelector('[role="alert"]')).toBeNull(); expect(read).toHaveBeenCalledTimes(3);
    } finally { vi.useRealTimers(); }
  });

  it("keeps the entered correction, write lock and outside focus when current recovery returns a lower revision", async () => {
    const old = current("review", 18); const read = vi.fn().mockResolvedValueOnce(old).mockResolvedValueOnce(current("review", 17)).mockResolvedValueOnce(current("review", 19));
    const mutate = vi.fn(async () => { throw new RebuildUnconfirmedError(); }); const transport: RebuildTransport = { read, start: vi.fn(), mutate };
    await mount(createElement(WebsiteEntry, props(transport, old)));
    await act(async () => button("Edit").click()); const field = node.querySelector("textarea")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "Retained fictional correction"); field.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => button("Save correction").click());
    const select = node.querySelector("select")!; select.focus();
    await act(async () => button("Reload current state").click());
    expect(field.value).toBe("Retained fictional correction"); expect(node.querySelector("textarea")).toBe(field); expect(field.disabled).toBe(true);
    expect(button("Save correction").disabled).toBe(true); expect(node.querySelector('[role="alert"]')?.textContent).toContain("could not be loaded"); expect(document.activeElement).toBe(select); expect(mutate).toHaveBeenCalledTimes(1);
    await act(async () => button("Reload current state").click());
    expect(node.querySelector('[role="alert"]')).toBeNull(); expect(node.textContent).toContain("Saved state refreshed"); expect(document.activeElement).toBe(select); expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("withholds a lower saved-mutation view and offers an exact current read instead of relabeling or navigating", async () => {
    const old = current("review", 18); const read = vi.fn().mockResolvedValueOnce(old).mockResolvedValueOnce(current("approved", 20));
    const mutate = vi.fn(async () => ({ ...current("review", 17), title: "Stale saved result" })); const transport: RebuildTransport = { read, start: vi.fn(), mutate };
    await mount(createElement(WebsiteEntry, props(transport, old))); const replace = vi.spyOn(window.history, "replaceState");
    await act(async () => button("Confirm").click());
    expect(selectedLabel()).toBe("Fictional bakery · review"); expect(node.textContent).not.toContain("Stale saved result"); expect(button("Reload current state")).toBeDefined(); expect(replace).not.toHaveBeenCalled();
    await act(async () => button("Reload current state").click());
    expect(selectedLabel()).toBe("Fictional bakery · approved"); expect(mutate).toHaveBeenCalledTimes(1); expect(replace).not.toHaveBeenCalled(); replace.mockRestore();
  });

  it("ignores old work reads through A to B to A selection generations", async () => {
    const a = current("building", 0); const b = { ...current("building", 0, "55555555-5555-4555-8555-555555555555"), title: "Second fictional bakery" };
    const oldA = deferred<RebuildView>(); const oldB = deferred<RebuildView>(); const freshA = deferred<RebuildView>();
    const read = vi.fn().mockImplementationOnce(() => oldA.promise).mockImplementationOnce(() => oldB.promise).mockImplementationOnce(() => freshA.promise);
    const transport: RebuildTransport = { read, start: vi.fn(), mutate: vi.fn() };
    await mount(createElement(WebsiteEntry, { ...props(transport, a), rebuilds: [a, b] }));
    const select = node.querySelector("select")!;
    await act(async () => { select.value = b.workId; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => { select.value = a.workId; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => freshA.resolve(current("published", 24)));
    await act(async () => { oldA.resolve({ ...current("review", 30), title: "Stale first selection" }); oldB.resolve({ ...b, status: "approved", revision: 50 }); });
    expect(read.mock.calls[0]![2].aborted).toBe(true); expect(read.mock.calls[1]![2].aborted).toBe(true);
    expect(select.value).toBe(a.workId); expect(selectedLabel()).toBe("Fictional bakery · published"); expect([...select.options].some(option => option.textContent?.includes("Stale first selection"))).toBe(false);
  });

  it("resets its option scope for another workspace and ignores the old pending read", async () => {
    const old = current("building", 0); const pending = deferred<RebuildView>(); const otherWorkspace = "22222222-2222-4222-8222-222222222222";
    const next = { ...current("published", 24), workspaceId: otherWorkspace, title: "Another workspace website" };
    const read = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValueOnce(next);
    const transport: RebuildTransport = { read, start: vi.fn(), mutate: vi.fn() };
    await mount(createElement(WebsiteEntry, props(transport, old)));
    await act(async () => root!.render(createElement(WebsiteEntry, { ...props(transport, next), workspaceId: otherWorkspace })));
    await act(async () => pending.resolve({ ...current("review", 100), title: "Prior workspace title" }));
    expect(selectedLabel()).toBe("Another workspace website · published"); expect(node.textContent).not.toContain("Prior workspace title"); expect(read.mock.calls[0]![2].aborted).toBe(true);
  });

  it.each(["workspace", "work"] as const)("does not adopt a current view for a foreign %s into navigation", async kind => {
    const old = current("building", 0); const foreign = { ...current("review", 20), ...(kind === "workspace" ? { workspaceId: "22222222-2222-4222-8222-222222222222" } : { workId: "55555555-5555-4555-8555-555555555555" }), title: "Unrelated title" };
    const transport: RebuildTransport = { read: vi.fn(async () => foreign), start: vi.fn(), mutate: vi.fn() };
    await mount(createElement(WebsiteEntry, props(transport, old)));
    expect(selectedLabel()).toBe("Fictional bakery · building"); expect([...node.querySelector("select")!.options].some(option => option.textContent?.includes("Unrelated title"))).toBe(false);
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("The current saved website could not be confirmed");
    expect(node.textContent).not.toContain("Unrelated title");
  });

});
