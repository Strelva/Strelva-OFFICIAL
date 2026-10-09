// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WebsiteExperience } from "@/experience/websites/WebsiteExperience";
import { RebuildExperience } from "@/experience/websites/RebuildExperience";
import { parseRebuildView } from "@/experience/websites/rebuild-transport";
import { fixtureSiteDocument } from "@/experience/websites/rebuild-fixture";
import { siteDocumentHash } from "@/products/websites/site-document";
const workspaceId = "11111111-1111-4111-8111-111111111111", workId = "44444444-4444-4444-8444-444444444444";
const options = { tenants: [{ tenantId: "fictional-bakery", siteName: "Fictional bakery", inquiry: [{ capabilityId: "orders", version: 1, name: "Order requests" }, { capabilityId: "catering", version: 2, name: "Catering requests" }], booking: [] }] };
function envelope(revision = 1, approved = true) {
 const document = structuredClone(fixtureSiteDocument); document.facts = {};
 document.capabilities = { baseUrl: "https://app.example.test", tenant: "fictional-bakery", inquiry: { capabilityId: revision === 1 ? "orders" : "catering", version: revision } };
 return { workId, workspaceId, rebuild: { version: 2, revision, title: "Fictional bakery", input: { requestId: "selector-peer-fixture", businessName: "Fictional bakery", description: "A fictional independent recovery fixture." }, status: approved ? "approved" : "review_ready", stages: [], checkpoint: null, candidate: { revision, contentHash: siteDocumentHash(document), document, previewHref: `/api/websites/${workId}/preview` }, approvedCandidateRevision: approved ? revision : null, publishedCapabilitySelection: { tenantId: "fictional-bakery", inquiryCapabilityId: revision === 1 ? "orders" : "catering" }, tenantId: "fictional-bakery", launch: { receipt: null, readBack: null }, lastError: null, createdBy: "fixture-owner", createdAt: "2026-10-01T12:00:00Z", history: [] } };
}
let root: Root; let node: HTMLDivElement;
const button = (name: string) => [...node.querySelectorAll("button")].find(value => value.textContent?.trim() === name);
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function mount() { node = document.createElement("div"); document.body.append(node); root = createRoot(node); await act(async () => root.render(createElement(RebuildExperience, { workspaceId, initialRecord: parseRebuildView(envelope()) }))); }
async function choose() { await act(async () => button("Choose forms")!.click()); const form = node.querySelectorAll("select")[1]!; await act(async () => { form.value = "catering"; form.dispatchEvent(new Event("change", { bubbles: true })); }); }
it("adopts a validated acknowledgement in the actual Rebuild parent and invalidates old approval", async () => {
 const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => Response.json(init?.method === "POST" ? envelope(2, false) : options)); vi.stubGlobal("fetch", transport);
 await mount(); await choose(); await act(async () => button("Update website preview")!.click());
 expect(button("Publish approved website")).toBeUndefined(); expect(node.textContent).not.toContain("This exact preview is approved.");
 expect(node.textContent).toContain("Visitor forms saved in a new preview");
});
it.each(["503", "malformed200"])("holds old approved UI behind current-state reload after %s", async kind => {
 const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => init?.method !== "POST" ? Response.json(options) : kind === "503" ? Response.json({ error: "Post-commit acknowledgement unavailable in fixture." }, { status: 503 }) : Response.json({ workId, workspaceId, rebuild: { committedRevision: 2 } })); vi.stubGlobal("fetch", transport);
 await mount(); await choose(); await act(async () => button("Update website preview")!.click());
 expect(node.querySelector("[role=alert]")).not.toBeNull();
 expect(button("Publish approved website")?.disabled ?? true).toBe(true);
 expect(button("Reload current state")).toBeDefined();
});
it("blocks available-form refresh as a substitute for current saved-state recovery after unknown save", async () => {
 const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => init?.method === "POST" ? Response.json({ error: "Unconfirmed." }, { status: 503 }) : Response.json(options)); vi.stubGlobal("fetch", transport);
 await mount(); await choose(); await act(async () => button("Update website preview")!.click()); await act(async () => button("Refresh available forms")!.click());
 expect(transport.mock.calls.filter(([, init]) => init?.method !== "POST")).toHaveLength(1);
 expect(transport.mock.calls.every(([url]) => String(url).endsWith("/connections"))).toBe(true);
 expect(node.textContent).not.toContain("This exact preview is approved.");
 expect(button("Publish approved website")!.disabled).toBe(true);
 expect(button("Reload current state")).toBeDefined();
});

function legacyRecord(revision = 1, approved = true) {
 const contentHash = "a".repeat(64);
 const artifact = { kind: "website_candidate", revision, spec: { version: 1, siteName: "Fictional bakery", content: { hero: { headline: "Fictional bakery" } }, pages: { home: { sections: [{ type: "hero", visible: true, order: 0, props: { headline: "Fictional bakery" } }] } }, theme: { fontDisplay: "Instrument_Serif", fontBody: "Inter" } }, contentHash, rendererDigest: "b".repeat(64), artifactDigest: "c".repeat(64), preview: { href: `/preview/websites/${revision}`, revision, contentHash }, generatedAt: "2026-10-01T12:00:00Z" };
 return { workId, workspaceId, createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", website: { version: 1, revision, title: "Fictional bakery", brief: { businessName: "Fictional bakery", description: "A fictional independent recovery fixture.", primaryCallToAction: "Contact us" }, status: approved ? "approved" : "preview_ready", candidate: artifact, approvedCandidateRevision: approved ? revision : null, publishedCapabilitySelection: { tenantId: "fictional-bakery", inquiryCapabilityId: revision === 1 ? "orders" : "catering" }, launch: { status: "not_requested", candidateRevision: null, receipt: null, failure: null }, lastError: null, createdBy: "fixture-owner", createdAt: "2026-10-01T12:00:00Z", history: [] } };
}
async function mountLegacy() { node = document.createElement("div"); document.body.append(node); root = createRoot(node); await act(async () => root.render(createElement(WebsiteExperience, { workspaceId, workId }))); }
it("adopts a validated connection receipt in the actual legacy parent and clears old launch approval", async () => {
 const transport = vi.fn<typeof fetch>().mockImplementation(async (url, init) => Response.json(String(url).includes("/connections") ? init?.method === "POST" ? legacyRecord(2, false) : options : legacyRecord())); vi.stubGlobal("fetch", transport);
 await mountLegacy(); await choose(); await act(async () => button("Update website preview")!.click());
 expect(button("Prepare launch")).toBeUndefined(); expect(node.textContent).toContain("Preview version 2 is ready for your review"); expect(node.textContent).toContain("Website forms updated. Review and approve the new preview.");
});
it.each(["503", "malformed200"])("holds legacy approved actions behind current-state read after %s", async kind => {
 const transport = vi.fn<typeof fetch>().mockImplementation(async (url, init) => !String(url).includes("/connections") ? Response.json(legacyRecord()) : init?.method !== "POST" ? Response.json(options) : kind === "503" ? Response.json({ error: "Post-commit acknowledgement unavailable in fixture." }, { status: 503 }) : Response.json({ workId, workspaceId, website: { committedRevision: 2 } })); vi.stubGlobal("fetch", transport);
 await mountLegacy(); await choose(); await act(async () => button("Update website preview")!.click());
 expect(node.querySelector("[role=alert]")).not.toBeNull();
 expect(button("Prepare launch")?.disabled ?? true).toBe(true);
 expect(button("Reload current state") ?? button("Check saved status")).toBeDefined();
});
it("blocks legacy available-form refresh and exposes an actual current website read", async () => {
 const transport = vi.fn<typeof fetch>().mockImplementation(async (url, init) => !String(url).includes("/connections") ? Response.json(legacyRecord()) : init?.method === "POST" ? Response.json({ error: "Unconfirmed." }, { status: 503 }) : Response.json(options)); vi.stubGlobal("fetch", transport);
 await mountLegacy(); await choose(); await act(async () => button("Update website preview")!.click()); await act(async () => button("Refresh available forms")!.click());
 const websiteReads = transport.mock.calls.filter(([url, init]) => !String(url).includes("/connections") && init?.method !== "POST");
 expect(websiteReads).toHaveLength(1); // initial read only
 expect(button("Prepare launch")!.disabled).toBe(true); expect(node.textContent).not.toContain("Preview version 1 is approved.");
 expect(button("Check saved status")).toBeUndefined(); expect(button("Reload current state")).toBeDefined();
});
it.each(['rebuild', 'legacy'] as const)('performs one actual %s saved-state read after unknown, retains failed-read selection, and clears stale approval without replay', async kind => {
 let readMode: 'initial' | 'failed' | 'current' = 'initial'; let posts = 0; let currentReads = 0;
 const transport = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
  const path = String(url);
  if (init?.method === 'POST') { posts++; return Response.json({ error: 'Reply unavailable' }, { status: 503 }); }
  if (path.endsWith('/connections')) return Response.json(options);
  if (path.includes('/history?')) return Response.json({ revisions: [] });
  currentReads++;
  if (readMode === 'failed') return Response.json({ error: 'Read unavailable' }, { status: 503 });
  return Response.json(kind === 'legacy' ? legacyRecord(readMode === 'current' ? 2 : 1, readMode !== 'current') : envelope(readMode === 'current' ? 2 : 1, readMode !== 'current'));
 }); vi.stubGlobal('fetch', transport);
 await (kind === 'legacy' ? mountLegacy() : mount()); await choose(); button('Update website preview')!.focus();
 await act(async () => { button('Update website preview')!.click(); button('Update website preview')!.click(); });
 expect(posts).toBe(1); expect(document.activeElement).toBe(button('Reload current state'));
 expect(node.textContent).not.toContain('is approved.'); expect(node.textContent).not.toContain('work are unchanged');
 const selected = node.querySelectorAll('select')[1]!; expect(selected.value).toBe('catering');
 readMode = 'failed'; await act(async () => { button('Reload current state')!.click(); button('Reload current state')!.click(); });
 expect(currentReads).toBe(kind === 'legacy' ? 2 : 1); expect(selected.value).toBe('catering'); expect(button('Update website preview')!.disabled).toBe(true);
 expect(node.textContent).toContain('could not be loaded'); expect(posts).toBe(1);
 readMode = 'current'; await act(async () => button('Reload current state')!.click());
 expect(currentReads).toBe(kind === 'legacy' ? 3 : 2); expect(posts).toBe(1); expect(button('Reload current state')).toBeUndefined();
 expect(button(kind === 'legacy' ? 'Prepare launch' : 'Publish approved website')).toBeUndefined();
 expect(document.activeElement).toBe(kind === 'legacy' ? node.querySelector('h1') : node.querySelector('#rebuild-decisions-heading'));
 expect(transport.mock.calls.some(([url]) => kind === 'legacy' ? /\/api\/websites\/[^/]+\?/.test(String(url)) : String(url).includes('/rebuild?'))).toBe(true);
});
it.each(['rebuild', 'legacy'] as const)('preserves deliberate outside focus during %s saved-state recovery', async kind => {
 let resolve!: (value: Response) => void; let readPending = false;
 const transport = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
  if (init?.method === 'POST') return Response.json({ error: 'Unknown' }, { status: 503 });
  if (String(url).endsWith('/connections')) return Response.json(options);
  if (String(url).includes('/history?')) return Response.json({ revisions: [] });
  if (readPending) return new Promise<Response>(yes => { resolve = yes; });
  return Response.json(legacyRecord());
 }); vi.stubGlobal('fetch', transport);
 await (kind === 'legacy' ? mountLegacy() : mount()); await choose(); button('Update website preview')!.focus();
 await act(async () => button('Update website preview')!.click());
 readPending = true; await act(async () => button('Reload current state')!.click());
 const outside = document.createElement('button'); document.body.append(outside); outside.focus();
 await act(async () => resolve(Response.json(kind === 'legacy' ? legacyRecord(2,false) : envelope(2,false))));
 expect(document.activeElement).toBe(outside); outside.remove();
});
function renderKind(kind: 'rebuild' | 'legacy', readOnly = false) {
 return kind === 'legacy' ? createElement(WebsiteExperience, { workspaceId, workId, readOnly }) : createElement(RebuildExperience, { workspaceId, initialRecord: parseRebuildView(envelope()), readOnly });
}
it.each(['rebuild', 'legacy'] as const)('holds %s unknown after permission loss and regain before a valid forms response', async kind => {
 let respond!: (value: Response) => void;
 vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
  if (init?.method === 'POST') return new Promise<Response>(yes => { respond = yes; });
  if (String(url).endsWith('/connections')) return Response.json(options);
  return Response.json(legacyRecord());
 }));
 await (kind === 'legacy' ? mountLegacy() : mount()); await choose();
 await act(async () => button('Update website preview')!.click());
 await act(async () => root.render(renderKind(kind, true)));
 await act(async () => root.render(renderKind(kind)));
 await act(async () => respond(Response.json(kind === 'legacy' ? legacyRecord(2,false) : envelope(2,false))));
 expect(button('Reload current state')).toBeDefined(); expect(button(kind === 'legacy' ? 'Prepare launch' : 'Publish approved website')!.disabled).toBe(true);
 expect(node.textContent).not.toContain('is approved.'); expect(node.textContent).not.toContain('forms updated'); expect(node.textContent).not.toContain('forms saved');
});
it.each(['rebuild', 'legacy'] as const)('ignores %s current-state read after permission loss and regain, and permits read-only explicit recovery', async kind => {
 let respond!: (value: Response) => void; let pending = false;
 vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
  if (init?.method === 'POST') return Response.json({ error: 'Unknown' }, { status: 503 });
  if (String(url).endsWith('/connections')) return Response.json(options);
  if (String(url).includes('/history?')) return Response.json({ revisions: [] });
  if (pending) return new Promise<Response>(yes => { respond = yes; });
  return Response.json(legacyRecord());
 }));
 await (kind === 'legacy' ? mountLegacy() : mount()); await choose(); await act(async () => button('Update website preview')!.click());
 pending = true; await act(async () => button('Reload current state')!.click());
 await act(async () => root.render(renderKind(kind, true))); await act(async () => root.render(renderKind(kind)));
 await act(async () => respond(Response.json(kind === 'legacy' ? legacyRecord(2,false) : envelope(2,false))));
 expect(button('Reload current state')).toBeDefined(); expect(button(kind === 'legacy' ? 'Prepare launch' : 'Publish approved website')!.disabled).toBe(true);
 await act(async () => root.render(renderKind(kind, true)));
 await act(async () => button('Reload current state')!.click());
 await act(async () => respond(Response.json(kind === 'legacy' ? legacyRecord(2,false) : envelope(2,false))));
 expect(button('Reload current state')).toBeUndefined(); expect(button('Choose forms')!.disabled).toBe(true);
});
it.each(['rebuild', 'legacy'] as const)('rejects a %s current-state receipt for foreign work while retaining the entered form selection', async kind => {
 let foreign = false;
 vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
  if (init?.method === 'POST') return Response.json({ error: 'Unknown' }, { status: 503 });
  if (String(url).endsWith('/connections')) return Response.json(options);
  if (String(url).includes('/history?')) return Response.json({ revisions: [] });
  const current = kind === 'legacy' ? legacyRecord(2,false) : envelope(2,false);
  return Response.json(foreign ? { ...current, workId: '55555555-5555-4555-8555-555555555555' } : legacyRecord());
 }));
 await (kind === 'legacy' ? mountLegacy() : mount()); await choose(); await act(async () => button('Update website preview')!.click());
 foreign = true; await act(async () => button('Reload current state')!.click());
 expect(button('Reload current state')).toBeDefined(); expect(node.querySelectorAll('select')[1]!.value).toBe('catering');
 expect(button(kind === 'legacy' ? 'Prepare launch' : 'Publish approved website')!.disabled).toBe(true);
});
it.each(['rebuild', 'legacy'] as const)('respects outside focus before %s uncertain forms completion', async kind => {
 let respond!: (value: Response) => void;
 vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
  if (init?.method === 'POST') return new Promise<Response>(yes => { respond = yes; });
  if (String(url).endsWith('/connections')) return Response.json(options);
  return Response.json(legacyRecord());
 }));
 await (kind === 'legacy' ? mountLegacy() : mount()); await choose(); button('Update website preview')!.focus();
 await act(async () => button('Update website preview')!.click());
 const outside = document.createElement('button'); document.body.append(outside); outside.focus();
 await act(async () => respond(Response.json({ error: 'Unknown' }, { status: 503 })));
 expect(document.activeElement).toBe(outside); expect(button('Reload current state')).toBeDefined(); outside.remove();
});
it.each(['rebuild', 'legacy'] as const)('unlocks %s form editing when a current read confirms the same revision', async kind => {
 const transport = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
  if (init?.method === 'POST') return Response.json({ error: 'Unconfirmed reply' }, { status: 503 });
  if (String(url).endsWith('/connections')) return Response.json(options);
  if (String(url).includes('/history?')) return Response.json({ revisions: [] });
  return Response.json(kind === 'legacy' ? legacyRecord() : envelope());
 }); vi.stubGlobal('fetch', transport);
 await (kind === 'legacy' ? mountLegacy() : mount()); await choose(); await act(async () => button('Update website preview')!.click());
 await act(async () => button('Reload current state')!.click());
 expect(button('Reload current state')).toBeUndefined();
 const formsAction = button('Choose forms') ?? button('Update website preview');
 expect(formsAction).toBeDefined(); expect(formsAction!.disabled).toBe(false);
});
