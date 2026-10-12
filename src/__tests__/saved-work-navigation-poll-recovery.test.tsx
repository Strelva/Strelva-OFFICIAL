// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WebsiteEntry } from "@/experience/websites/WebsiteEntry";
import { fixtureRebuild } from "@/experience/websites/rebuild-fixture";
import { parseRebuildView, type RebuildTransport } from "@/experience/websites/rebuild-transport";
import { actor, harness } from "./rebuild-recovery-independent-harness";
let root: Root; let node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.append(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const button = (text: string) => Array.from(node.querySelectorAll("button")).find(b => b.textContent?.trim() === text);
async function mount(record: ReturnType<typeof fixtureRebuild>, transport?: RebuildTransport) {
  await act(async () => root.render(createElement(WebsiteEntry, { workspaceId: record.workspaceId, initialWorkId: record.workId, rebuilds: [record], connectedEnabled: false, rebuildEnabled: true, path: "rebuild", canManage: true, canPublish: true, transport })));
}
it.each([false, true])("preserves appropriate focus after lower Confirm acknowledgment, outside=%s", async outside => {
  const current = { ...fixtureRebuild(), revision: 18 };
  const transport = { read: vi.fn(async () => current), start: vi.fn(), mutate: vi.fn(async () => ({ ...current, revision: 17 })) };
  await mount(current, transport); button("Confirm")!.focus();
  if (outside) node.querySelector("select")!.focus();
  await act(async () => button("Confirm")!.click());
  expect(button("Reload current state")).toBeDefined();
  expect(document.activeElement).toBe(outside ? node.querySelector("select") : button("Reload current state"));
  expect(transport.mutate).toHaveBeenCalledTimes(1);
});
it.each([false, true])("preserves appropriate focus after lower correction acknowledgment, outside=%s", async outside => {
  const current = { ...fixtureRebuild(), revision: 18 };
  const transport = { read: vi.fn(async () => current), start: vi.fn(), mutate: vi.fn(async () => ({ ...current, revision: 17 })) };
  await mount(current, transport); await act(async () => button("Edit")!.click());
  const field = node.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(field,"Independent correction"); field.dispatchEvent(new Event("input",{ bubbles:true })); });
  button("Save correction")!.focus(); if (outside) node.querySelector("select")!.focus();
  await act(async () => button("Save correction")!.click());
  expect(field.value).toBe("Independent correction"); expect(field.disabled).toBe(true);
  expect(document.activeElement).toBe(outside ? node.querySelector("select") : button("Reload current state"));
});
it("uses the actual default HTTP consumer to adopt the actual memory-service current view into navigation", async () => {
  const h = harness(); const envelope = await h.create(); const current = parseRebuildView(envelope);
  const request = vi.fn<typeof fetch>(async path => String(path).includes("/history?") ? Response.json({ revisions:[] }) : Response.json(await h.service.read(actor,envelope.workId)));
  vi.stubGlobal("fetch",request);
  await mount({ ...current, revision:0, status:"building" });
  expect(node.querySelector("select")!.selectedOptions[0]!.textContent).toBe(`${current.title} · review`);
  expect(node.querySelector("h1")!.textContent).toBe(current.title);
  expect(request.mock.calls.filter(([path]) => String(path).includes("/rebuild?"))).toHaveLength(1);
});
it("keeps a real current-state recovery action when a domain background read follows an unknown save", async () => {
  const h = harness(); const envelope = await h.launch(await h.create()); const current = parseRebuildView(envelope);
  const domain = fixtureRebuild("domain-pending").domain;
  let posts = 0;
  const request = vi.fn<typeof fetch>(async (path, init) => {
    if (init?.method === "POST") { posts++; return Response.json({ error:"The acknowledgement was lost." },{ status:503 }); }
    if (String(path).includes("/history?")) return Response.json({ revisions:[] });
    if (String(path).includes("/domain?")) return Response.json({ domain });
    if (String(path).endsWith("/connections")) return Response.json({ tenants:[] });
    if (String(path).includes("/report?")) return Response.json({ error:"Unavailable fixture report" },{ status:503 });
    return Response.json(await h.service.read(actor,envelope.workId));
  });
  vi.stubGlobal("fetch",request); vi.useFakeTimers();
  await mount(current);
  // Ordinary supported facts remain editable after publication; this uses the real default HTTP transport.
  const editor = node.querySelector("details")!;
  expect(editor.textContent).toContain("Edit website facts");
  await act(async () => editor.querySelector("button")!.click());
  const field = editor.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(field,"Corrected fictional description"); field.dispatchEvent(new Event("input",{ bubbles:true })); });
  await act(async () => button("Save correction")!.click());
  expect(posts).toBe(1); expect(button("Reload current state")).toBeDefined();
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(field.disabled).toBe(true);
  expect(button("Reload current state")).toBeDefined();
  expect(node.querySelector('[role="alert"]')?.textContent).toContain("could not be confirmed");
  expect(posts).toBe(1);
});

async function ordinaryDraft(text: string) {
  const editor = node.querySelector("details")!;
  await act(async () => editor.querySelector("button")!.click());
  const field = editor.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(field,text); field.dispatchEvent(new Event("input",{ bubbles:true })); });
  return field;
}
function actualReadRequest(h: ReturnType<typeof harness>, workId: string, post: (init: RequestInit) => Promise<Response>, beforeRead?: () => Response | null) {
  return vi.fn<typeof fetch>(async (path, init) => {
    if (init?.method === "POST") return post(init);
    if (String(path).includes("/history?")) return Response.json({ revisions:[] });
    if (String(path).includes("/domain?")) return Response.json({ domain: fixtureRebuild("domain-pending").domain });
    if (String(path).endsWith("/connections")) return Response.json({ tenants:[] });
    if (String(path).includes("/report?")) return Response.json({ error:"Unavailable fixture report" },{ status:503 });
    return beforeRead?.() ?? Response.json(await h.service.read(actor,workId));
  });
}
it("keeps a known fact validation refusal through successful background reads while the draft remains correctable", async () => {
  const h = harness(); const envelope = await h.launch(await h.create()); const current = parseRebuildView(envelope);
  const request = actualReadRequest(h,envelope.workId,async () => Response.json({ error:"Correct the supplied fact before saving." },{ status:400 }));
  vi.stubGlobal("fetch",request); vi.useFakeTimers(); await mount(current);
  const field = await ordinaryDraft("Entered fictional correction");
  await act(async () => button("Save correction")!.click());
  expect(field.disabled).toBe(false); expect(node.querySelector('section[aria-label="Website rebuild"] > [role="alert"]')?.textContent).toContain("Correct the supplied fact");
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(node.querySelector('section[aria-label="Website rebuild"] > [role="alert"]')?.textContent).toContain("Correct the supplied fact"); expect(field.value).toBe("Entered fictional correction"); expect(field.disabled).toBe(false);
  expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1); expect(button("Reload current state")).toBeUndefined();
});
it("clears only a recovered domain-read error and retains the existing unsaved draft and keyboard focus", async () => {
  const h = harness(); const envelope = await h.launch(await h.create()); const current = parseRebuildView(envelope); let failRead = false;
  const request = actualReadRequest(h,envelope.workId,async () => { throw new Error("Unexpected write"); },() => failRead ? Response.json({ error:"Domain read temporarily unavailable." },{ status:503 }) : null);
  vi.stubGlobal("fetch",request); vi.useFakeTimers(); await mount(current);
  const field = await ordinaryDraft("Unsaved fictional wording"); field.focus(); failRead = true;
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(node.querySelector('section[aria-label="Website rebuild"] > [role="alert"]')?.textContent).toContain("Domain read temporarily unavailable"); failRead = false;
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(node.querySelector('section[aria-label="Website rebuild"] > [role="alert"]')).toBeNull(); expect(field.value).toBe("Unsaved fictional wording"); expect(document.activeElement).toBe(field);
  expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
});
it("does not replace unknown-command recovery with a later background-read failure", async () => {
  const h = harness(); const envelope = await h.launch(await h.create()); const current = parseRebuildView(envelope); let failRead = false;
  const request = actualReadRequest(h,envelope.workId,async () => Response.json({ error:"Lost acknowledgement" },{ status:503 }),() => failRead ? Response.json({ error:"Background domain read unavailable" },{ status:503 }) : null);
  vi.stubGlobal("fetch",request); vi.useFakeTimers(); await mount(current); const field = await ordinaryDraft("Retained fictional correction");
  await act(async () => button("Save correction")!.click()); node.querySelector("select")!.focus(); failRead = true;
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(node.querySelector('section[aria-label="Website rebuild"] > [role="alert"]')?.textContent).toContain("could not be confirmed"); expect(node.querySelector('section[aria-label="Website rebuild"] > [role="alert"]')?.textContent).not.toContain("Background domain read unavailable");
  expect(button("Reload current state")).toBeDefined(); expect(field.value).toBe("Retained fictional correction"); expect(field.disabled).toBe(true); expect(document.activeElement).toBe(node.querySelector("select"));
});
it("does not adopt a committed correction through automatic domain polling before the explicit exact current read", async () => {
  const h = harness(); const envelope = await h.launch(await h.create()); const current = parseRebuildView(envelope);
  const factId = Object.keys(current.candidate!.facts)[0]!; let posts = 0;
  const request = actualReadRequest(h,envelope.workId,async init => { posts++; await h.service.resolveFact(actor,envelope.workId,factId,JSON.parse(String(init.body))); return Response.json({ error:"Committed acknowledgment lost" },{ status:503 }); });
  vi.stubGlobal("fetch",request); vi.useFakeTimers(); await mount(current); const field = await ordinaryDraft("Corrected fictional description");
  await act(async () => button("Save correction")!.click());
  const saved = await h.service.read(actor,envelope.workId); expect(saved.rebuild.approvedCandidateRevision).toBeNull(); expect(saved.rebuild.revision).toBeGreaterThan(current.revision); expect(saved.rebuild.candidate!.document.facts[factId]!.text).toBe("Corrected fictional description");
  const select = node.querySelector("select")!; select.focus();
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(field.value).toBe("Corrected fictional description"); expect(field.disabled).toBe(true); expect(node.contains(field)).toBe(true); expect(select.selectedOptions[0]!.textContent).toBe(`${current.title} · published`); expect(button("Reload current state")).toBeDefined(); expect(document.activeElement).toBe(select); expect(posts).toBe(1);
  await act(async () => button("Reload current state")!.click());
  expect(node.textContent).toContain("Saved state refreshed"); expect(node.querySelector('section[aria-label="Website rebuild"] > [role="alert"]')).toBeNull(); expect(node.querySelector("select")!.selectedOptions[0]!.textContent).toBe(`${saved.rebuild.title} · review`); expect(posts).toBe(1); expect(document.activeElement).toBe(select);
});

it("holds the initiated view during a pending postcommit write, then reconciles only through the explicit exact read", async () => {
  const h = harness(); const envelope = await h.launch(await h.create()); const current = parseRebuildView(envelope);
  const factId = Object.keys(current.candidate!.facts)[0]!; let posts = 0;
  let acknowledge!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { acknowledge = resolve; });
  const request = actualReadRequest(h,envelope.workId,async init => { posts++; await h.service.resolveFact(actor,envelope.workId,factId,JSON.parse(String(init.body))); return pending; });
  vi.stubGlobal("fetch",request); vi.useFakeTimers(); await mount(current);
  const field = await ordinaryDraft("Captured postcommit correction");
  await act(async () => button("Save correction")!.click());
  const committed = await h.service.read(actor,envelope.workId);
  expect(committed.rebuild.revision).toBeGreaterThan(current.revision); expect(committed.rebuild.approvedCandidateRevision).toBeNull(); expect(posts).toBe(1);
  const select = node.querySelector("select")!; select.focus();
  const readsBefore = request.mock.calls.filter(([path]) => String(path).includes("/rebuild?")).length;
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(request.mock.calls.filter(([path]) => String(path).includes("/rebuild?")).length).toBeGreaterThan(readsBefore);
  expect(node.contains(field)).toBe(true); expect(field.value).toBe("Captured postcommit correction"); expect(field.disabled).toBe(true);
  expect(select.selectedOptions[0]!.textContent).toBe(`${current.title} · published`); expect(document.activeElement).toBe(select); expect(posts).toBe(1);
  await act(async () => acknowledge(Response.json({ error:"Committed acknowledgment unavailable" },{ status:503 })));
  expect(button("Reload current state")).toBeDefined(); expect(field.disabled).toBe(true); expect(select.selectedOptions[0]!.textContent).toBe(`${current.title} · published`); expect(document.activeElement).toBe(select);
  await act(async () => button("Reload current state")!.click());
  expect(node.textContent).toContain("Saved state refreshed"); expect(node.querySelector('section[aria-label="Website rebuild"] > [role="alert"]')).toBeNull();
  expect(select.selectedOptions[0]!.textContent).toBe(`${committed.rebuild.title} · review`); expect(document.activeElement).toBe(select); expect(posts).toBe(1);
});


it("keeps the existing saved selection until a held exact current HTTP read from the real service is consumed", async () => {
  const h = harness(); const envelope = await h.launch(await h.create()); const current = parseRebuildView(envelope);
  const factId = Object.keys(current.candidate!.facts)[0]!; let posts = 0, holdRead = false, heldReads = 0;
  let releaseRead!: () => void;
  const readBarrier = new Promise<void>(resolve => { releaseRead = resolve; });
  const delegate = actualReadRequest(h,envelope.workId,async init => {
    posts++; await h.service.resolveFact(actor,envelope.workId,factId,JSON.parse(String(init.body)));
    return Response.json({ error:"Actual memory commit acknowledgment withheld" },{ status:503 });
  });
  const request = vi.fn<typeof fetch>(async (path,init) => {
    if (holdRead && String(path).includes("/rebuild?")) {
      const url = new URL(String(path),"https://fixture.example.test");
      expect(url.pathname).toBe(`/api/websites/${envelope.workId}/rebuild`);
      expect([...url.searchParams]).toEqual([["workspaceId",current.workspaceId]]);
      heldReads++; await readBarrier;
    }
    return delegate(path,init);
  });
  vi.stubGlobal("fetch",request); await mount(current);
  const field = await ordinaryDraft("Held real-service current read correction");
  await act(async () => button("Save correction")!.click());
  const committed = await h.service.read(actor,envelope.workId);
  expect(committed.rebuild.revision).toBeGreaterThan(current.revision);
  expect(committed.rebuild.candidate!.document.facts[factId]!.text).toBe("Held real-service current read correction");
  expect(committed.rebuild.approvedCandidateRevision).toBeNull(); expect(posts).toBe(1);
  holdRead = true;
  await act(async () => button("Reload current state")!.click());
  const select = node.querySelector("select")!; select.focus();
  expect(heldReads).toBe(1); expect(select.value).toBe(current.workId);
  expect(select.selectedOptions[0]!.textContent).toBe(`${current.title} · published`);
  expect(node.querySelector("h1")!.textContent).toBe(current.title);
  expect(button("Reload current state")!.disabled).toBe(true); expect(field.disabled).toBe(true);
  expect(document.activeElement).toBe(select);
  await act(async () => releaseRead());
  expect(select.value).toBe(current.workId);
  expect(select.selectedOptions[0]!.textContent).toBe(`${committed.rebuild.title} · review`);
  expect(node.querySelector("h1")!.textContent).toBe(committed.rebuild.title);
  expect(node.textContent).toContain("Saved state refreshed. Review the current preview before continuing.");
  expect(button("Reload current state")).toBeUndefined(); expect(document.activeElement).toBe(select);
  expect(posts).toBe(1); expect(heldReads).toBe(1);
});
