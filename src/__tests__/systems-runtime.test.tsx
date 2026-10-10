// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SystemPage } from "@/experience/systems/SystemPage";
import { readBusinessSystems } from "@/experience/systems/from-workspace";
import { WorkspaceLayout } from "@/experience/workspace/WorkspaceLayout";
import { readResponse, WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import type { WorkspaceSnapshot, WorkspaceWork } from "@/experience/workspace/contracts";
import { fixtureSiteDocument, fixtureRebuild } from "@/experience/websites/rebuild-fixture";
import { websiteDocumentVersion } from "@/experience/websites/contracts";
import { websiteRebuildSchema } from "@/products/websites/rebuild-contracts";
import { createApplicationService } from "@/products/applications/server";
import { createSchedulingService } from "@/products/scheduling/server";
import { WorkspaceAccessError, type SavedWork, type WorkspaceActor } from "@/platform/workspaces/types";
import type { BoundedStore } from "@/platform/bounded-work/repository";
import { memoryBoundedStore, owner } from "./fixtures/bounded-store";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams(window.location.search) }));

const member: WorkspaceActor = { userId: "member", verifiedEmail: "member@example.com" };
const SYSTEM = "51000000-0000-4000-8000-000000000001";
const noop = () => undefined;
let root: Root | undefined;
let container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); HTMLElement.prototype.scrollTo = vi.fn(); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; container?.remove(); window.history.replaceState(null, "", "/"); vi.unstubAllGlobals(); });

function memberStore(): BoundedStore & { manager: (actor: WorkspaceActor, workspaceId: string) => Promise<void> } {
  const base = memoryBoundedStore("33333333-3333-4333-8333-333333333333");
  const assertMember = async (actor: WorkspaceActor, workspaceId: string) => {
    if (workspaceId !== "33333333-3333-4333-8333-333333333333" || ![owner.userId, member.userId].includes(actor.userId)) throw new WorkspaceAccessError();
  };
  return {
    member: assertMember,
    async manager(actor, workspaceId) { await assertMember(actor, workspaceId); if (actor.userId !== owner.userId) throw new WorkspaceAccessError("Management access is required."); },
    async read(actor, id) { await assertMember(actor, "33333333-3333-4333-8333-333333333333"); return base.read(owner, id); },
    async create(actor, workspaceId, input) { await assertMember(actor, workspaceId); return base.create(owner, workspaceId, input); },
    async update(actor, work, revision, payload) { await assertMember(actor, work.workspaceId); return base.update(owner, work, revision, payload); },
  };
}

async function snapshot(work: WorkspaceWork<unknown>, role: "owner" | "member" = "owner", access?: "delegated_read"): Promise<WorkspaceSnapshot> {
  const response: Omit<WorkspaceSnapshot, "work"> & { work: WorkspaceWork<unknown>[] } = {
    actor: { email: member.verifiedEmail, localPreview: true }, workspaceId: work.workspaceId,
    workspaces: [{ id: work.workspaceId, kind: "customer", name: "Fixture business", role, ...(access ? { access } : {}) }],
    work: [work], products: [], handoffs: [], delegations: [], releases: { systems: true },
    systems: { status: "ready", systems: [{ ref: { businessId: work.workspaceId, systemId: SYSTEM }, name: work.title, kind: work.productId === "websites" ? "website" : work.productId === "applications" ? "internal_app" : "booking", lifecycle: "live", basis: null, savedWorkId: work.id, tenantId: null, health: { status: "unknown", summary: "No verification recorded.", lastVerifiedAt: null } }], connections: [], possibilities: [] },
  };
  // The workspace JSON boundary accepts each product's own payload. The default
  // WorkspaceWork alias still describes the release-one AI visibility UI.
  return readResponse<WorkspaceSnapshot>(new Response(JSON.stringify(response)), "Fixture workspace could not be loaded.");
}
function source(row: SavedWork): WorkspaceWork {
  // App/schedule summaries load their full typed payload from /api/bounded-work.
  return { id: row.id, workspaceId: row.workspaceId, productId: row.productId, resourceKind: row.resourceKind, title: row.title ?? "Saved work", payload: null, input: {}, createdAt: row.createdAt };
}
async function mount(element: ReturnType<typeof createElement>) {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(element));
}
function input(label: string): HTMLInputElement {
  const element = [...container.querySelectorAll("label")].find(item => item.textContent?.startsWith(label));
  const field = element?.querySelector("input") || (element?.htmlFor ? container.querySelector<HTMLInputElement>(`[id="${element.htmlFor}"]`) : null);
  expect(field, label).toBeInstanceOf(HTMLInputElement); return field!;
}
async function fill(field: HTMLInputElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
}
function button(label: string) { return [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!; }

it.each([true, false])("searches canonical Systems and supporting files with the Systems release %s", async released => {
  const state = await snapshot({ id: "backing-work", workspaceId: "33333333-3333-4333-8333-333333333333", title: "Older document controls", productId: "documents", resourceKind: "document", payload: null, input: {}, createdAt: "2026-10-08T00:00:00Z" });
  state.work.push({ ...state.work[0]!, id: "supporting-file", title: "Decision evidence", productId: "ai_visibility", resourceKind: "assessment" });
  state.releases!.systems = released;
  state.systems!.systems[0]!.name = "Client intake";
  state.systems!.systems[0]!.kind = "document";
  state.systems!.history = [{ id: "retained-history", systemId: SYSTEM, sentence: "Earlier accepted change retained.", at: "2026-10-07T00:00:00Z" }];
  window.history.replaceState(null, "", "/workspace?view=work");
  const onChoose = vi.fn();
  const request = vi.fn(async () => new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 }));
  await mount(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(WorkspaceLayout, { snapshot: state, home: true, agency: false, busy: false, selectedWork: null, onHome: noop, onNew: noop, onOngoing: noop, onAgency: noop, onChoose, onWorkspace: noop, onOpenClientWork: noop, notice: null })));
  const results = [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  expect(results.map(item => item.querySelector("strong")!.textContent)).toEqual(released ? ["Decision evidence", "Client intake"] : ["Older document controls", "Decision evidence"]);
  await act(async () => results.find(item => item.textContent?.includes("Decision evidence"))!.click());
  expect(onChoose).toHaveBeenCalledWith("supporting-file");
  if (released) {
    onChoose.mockClear();
    const system = results.find(item => item.textContent?.includes("Client intake"))!;
    expect(system.textContent).toContain("Document");
    await act(async () => system.click());
    expect(new URLSearchParams(window.location.search).get("system")).toBe(SYSTEM);
    expect(new URLSearchParams(window.location.search).get("work")).toBeNull();
    expect(onChoose).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Earlier accepted change retained.");
  }
});

it.each([true, false])("opens a registry-only inquiry in the released business inbox (%s)", async inquiryInbox => {
  const state = await snapshot({ id: "file", workspaceId: "33333333-3333-4333-8333-333333333333", title: "File", productId: "ai_visibility", resourceKind: "assessment", payload: null, input: {}, createdAt: "2026-10-08T00:00:00Z" });
  state.work = [];
  state.systems!.systems = [{ ref: { businessId: state.workspaceId, systemId: SYSTEM }, name: "Inquiries", kind: "inquiry", lifecycle: "live", basis: null, savedWorkId: null, tenantId: null, health: { status: "unknown", summary: "No evidence", lastVerifiedAt: null } }];
  const { systems } = readBusinessSystems({ snapshot: state, sites: [] });
  expect(systems[0]!.surface).toEqual({ kind: "work", workId: SYSTEM, productId: "unknown" });
  const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ error: "Denied" }), { status: 403 }));
  vi.stubGlobal("fetch", request);
  await mount(createElement(SystemPage, { system: systems[0], systems, workspaceId: state.workspaceId, sources: [], readOnly: true, inquiryInbox, systemHref: id => `?system=${id}`, onHome: noop, onAsk: noop }));
  if (inquiryInbox) {
    expect(request.mock.calls).toHaveLength(1);
    expect(request.mock.calls[0]![0]).toBe("/api/workspace/inquiries?workspaceId=33333333-3333-4333-8333-333333333333");
    expect(container.textContent).toContain("This belongs to another business");
    expect(container.textContent).not.toContain("There is nothing to open");
  } else {
    expect(request).not.toHaveBeenCalled();
    expect(container.textContent).toContain("There is nothing to open");
  }
});
async function mountLayout(state: WorkspaceSnapshot, request: typeof fetch) {
  window.history.replaceState(null, "", `/workspace?workspaceId=${state.workspaceId}&view=system&system=${SYSTEM}`);
  await mount(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(WorkspaceLayout, {
    snapshot: state, home: true, agency: false, busy: false, selectedWork: null,
    onHome: noop, onNew: noop, onOngoing: noop, onAgency: noop, onChoose: noop, onWorkspace: noop, onOpenClientWork: noop, notice: null,
  })));
}

it.each([{ payload: { version: 2 } }, { payload: { rebuild: { version: 2 } } }, { payload: null, website: { version: 2 as const } }])("opens a standalone v2 website System in rebuild review even when new rebuilds are disabled (%j)", async ({ payload, ...projection }) => {
  const record = fixtureRebuild();
  const work: WorkspaceWork<typeof payload> = { id: record.workId, workspaceId: record.workspaceId, title: record.title, productId: "websites", resourceKind: "website", input: {}, payload, ...projection, createdAt: "2026-10-05T12:00:00Z" };
  const state = await snapshot(work);
  const { systems, files } = readBusinessSystems({ snapshot: state, sites: [] });
  expect(systems[0]?.surface).toEqual({ kind: "work", workId: record.workId, productId: "websites" });
  expect(files).toEqual([]);
  const envelope = { workId: record.workId, workspaceId: record.workspaceId, rebuild: websiteRebuildSchema.parse({
    version: 2, revision: 1, title: record.title, input: { requestId: "test-request", url: "https://example.test" },
    status: "review_ready", stages: [], checkpoint: null,
    candidate: { revision: 1, contentHash: "a".repeat(64), document: fixtureSiteDocument, previewHref: `/api/websites/${record.workId}/preview` },
    approvedCandidateRevision: null, tenantId: null, launch: { receipt: null, readBack: null }, lastError: null,
    createdBy: "owner", createdAt: "2026-10-05T12:00:00Z", history: [],
  }) };
  const request = vi.fn(async (url: RequestInfo | URL) => new Response(JSON.stringify(String(url).includes("/history") ? { history: [] } : envelope)));
  vi.stubGlobal("fetch", request);
  await mount(createElement(SystemPage, { system: systems[0], systems, workspaceId: record.workspaceId, sources: state.work, readOnly: false, rebuildEnabled: false, managed: true, systemHref: id => `?system=${id}`, onHome: noop, onAsk: noop }));
  expect(request.mock.calls.some(([url]) => String(url).includes(`/api/websites/${record.workId}/rebuild?`))).toBe(true);
  expect(container.textContent).toContain("2 decisions need you");
  expect(container.textContent).not.toContain("version this interface cannot display");
  expect(websiteDocumentVersion({ version: 1 })).toBeUndefined();
});

it("lets a member submit a released app through its System without design or sharing authority", async () => {
  const service = createApplicationService(memberStore());
  const created = await service.create(owner, "33333333-3333-4333-8333-333333333333", { title: "Requests", maintenanceOwner: owner.userId, fields: [{ id: "name", label: "Name", type: "text", required: true }], components: [{ kind: "form", fields: ["name"] }, { kind: "list", fields: ["name"] }] });
  await service.rehearse(owner, created.id, { expectedDesignRevision: 0 });
  const released = await service.publish(owner, created.id, { expectedCandidateRevision: 0, expectedReleaseVersion: null });
  const commands: unknown[] = [];
  const request: typeof fetch = async (url, init) => {
    if (!String(url).startsWith("/api/bounded-work")) return new Response(JSON.stringify({ error: "Not simulated." }), { status: 403 });
    if (init?.method === "POST") { const body = JSON.parse(String(init.body)); commands.push(body.command); return new Response(JSON.stringify(await service.command(member, created.id, body.command))); }
    return new Response(JSON.stringify(await service.read(member, created.id)));
  };
  await mountLayout(await snapshot(source(released), "member"), request);
  expect(button("Ask for a change").disabled).toBe(true);
  expect(container.querySelector('[role="tab"][id$="-edit-tab"]')).toBeNull();
  expect(container.textContent).not.toContain("Save new draft");
  expect(container.textContent).not.toContain("Sharing");
  expect(input("Name").disabled).toBe(false);
  await fill(input("Name"), "Member request");
  await act(async () => input("Name").closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(commands).toEqual([expect.objectContaining({ kind: "submit", expectedReleaseVersion: 1, expectedRecordsRevision: 0, record: expect.objectContaining({ values: { name: "Member request" } }) })]);
  expect((await service.readRuntime(member, created.id)).records).toHaveLength(1);
  await expect(service.revise(member, created.id, { expectedDesignRevision: 0, spec: released.payload.spec })).rejects.toThrow(/Management access/);
});

it("lets a member reserve workspace time while retaining native manager-only pause", async () => {
  const store = memberStore();
  const service = createSchedulingService(store, { assertManager: store.manager, workspaceExitCompleted: async () => false });
  const created = await service.create(owner, "33333333-3333-4333-8333-333333333333", { title: "Sessions", availability: [{ start: "2030-01-01T09:00:00Z", end: "2030-01-01T17:00:00Z" }] });
  const commands: unknown[] = [];
  const request: typeof fetch = async (url, init) => {
    if (!String(url).startsWith("/api/bounded-work")) return new Response(JSON.stringify({ error: "Not simulated." }), { status: 403 });
    if (init?.method === "POST") { const body = JSON.parse(String(init.body)); commands.push(body.command); return new Response(JSON.stringify(await service.command(member, created.id, body.command))); }
    return new Response(JSON.stringify(await service.read(member, created.id)));
  };
  await mountLayout(await snapshot(source(created), "member"), request);
  expect(button("Ask for a change").disabled).toBe(true);
  expect(container.querySelector('[aria-label="External calendar sync"]')).toBeNull();
  await fill(input("Reservation name"), "Member session");
  await fill(input("Starts"), "2030-01-01T10:00"); await fill(input("Ends"), "2030-01-01T11:00");
  expect(button("Reserve in workspace").disabled).toBe(false);
  await act(async () => button("Reserve in workspace").click());
  expect(commands).toEqual([expect.objectContaining({ kind: "reserve", title: "Member session" })]);
  expect((await service.read(member, created.id)).payload.reservations).toHaveLength(1);
  await expect(service.command(member, created.id, { kind: "pause", expectedRevision: 1, reason: "Closed" })).rejects.toThrow(/Management access/);
});

it("keeps shared read-only System use disabled", async () => {
  const service = createSchedulingService(memberStore(), { workspaceExitCompleted: async () => false });
  const created = await service.create(owner, "33333333-3333-4333-8333-333333333333", { title: "Sessions", availability: [{ start: "2030-01-01T09:00:00Z", end: "2030-01-01T17:00:00Z" }] });
  const request = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(String(url).startsWith("/api/bounded-work") ? created : { error: "Not simulated." }), { status: String(url).startsWith("/api/bounded-work") ? 200 : 403 }));
  await mountLayout(await snapshot(source(created), "member", "delegated_read"), request);
  expect(input("Reservation name").disabled).toBe(true);
  expect(button("Reserve in workspace").disabled).toBe(true);
  expect(request.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});

it.each([undefined, "delegated_read" as const, "provider_seat" as const])("lists registry-only Systems by identity and separates searchable files (%s)", async access => {
  const state = await snapshot({ id: "file", workspaceId: "33333333-3333-4333-8333-333333333333", title: "File", productId: "ai_visibility", resourceKind: "assessment", payload: null, input: {}, createdAt: "2026-10-08T00:00:00Z" });
  state.work = [{ ...state.work[0]!, id: "supporting-file", title: "Campaign evidence", productId: "ai_visibility", resourceKind: "assessment" }];
  state.workspaces[0]!.access = access;
  state.systems!.systems = ["inquiry", "listing", "newsletter"].map((kind, index) => ({ ref: { businessId: state.workspaceId, systemId: `51000000-0000-4000-8000-00000000000${index + 2}` }, name: `Registry ${kind}`, kind, lifecycle: "live", basis: null, savedWorkId: null, tenantId: null, health: { status: "unknown", summary: "No evidence", lastVerifiedAt: null } }));
  window.history.replaceState(null, "", "/workspace?view=work");
  const onChoose = vi.fn();
  const request = vi.fn(async () => new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 }));
  await mount(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(WorkspaceLayout, { snapshot: state, home: true, agency: false, busy: false, selectedWork: null, onHome: noop, onNew: noop, onOngoing: noop, onAgency: noop, onChoose, onWorkspace: noop, onOpenClientWork: noop, notice: null })));
  for (const [index, kind] of ["inquiry", "listing", "newsletter"].entries()) {
    const link = [...container.querySelectorAll("a")].find(item => item.textContent?.includes(`Registry ${kind}`));
    expect(link?.getAttribute("href")).toContain(`system=51000000-0000-4000-8000-00000000000${index + 2}`);
  }
  expect(container.textContent).toContain("Files");
  const file = container.querySelector<HTMLButtonElement>('[aria-label="Open file Campaign evidence"]')!;
  await act(async () => file.click());
  expect(onChoose).toHaveBeenCalledWith("supporting-file");
  const search = container.querySelector<HTMLInputElement>('#workspace-search')!;
  await fill(search, "newsletter");
  expect(container.textContent).toContain("Registry newsletter");
  expect(container.querySelector('[aria-labelledby="systems-directory-title"]')?.textContent).not.toContain("Registry listing");
  expect(container.querySelector('[aria-label="Open file Campaign evidence"]')).toBeNull();
  await fill(search, "campaign");
  expect(container.textContent).toContain("Campaign evidence");
  expect(container.querySelector('[aria-labelledby="systems-directory-title"]')?.textContent).not.toContain("Registry newsletter");
});

it("projects registry HomeFinder to the native business management surface", async () => {
  const state = await snapshot({ id: "file", workspaceId: "33333333-3333-4333-8333-333333333333", title: "File", productId: "ai_visibility", resourceKind: "assessment", payload: null, input: {}, createdAt: "2026-10-08T00:00:00Z" }, "member");
  state.work = [];
  state.systems!.systems = [{ ref: { businessId: state.workspaceId, systemId: SYSTEM }, name: "Brokerage search", kind: "home_finder", lifecycle: "draft", basis: null, savedWorkId: null, tenantId: null, health: { status: "unknown", summary: "License evidence pending", lastVerifiedAt: null } }];
  const result = readBusinessSystems({ snapshot: state, sites: [] });
  expect(result.systems[0]?.kind).toBe("home_finder");
  expect(result.systems[0]?.surface).toEqual({ kind: "work", workId: SYSTEM, productId: "home_finder" });
  const request = vi.fn(async () => new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 }));
  await mountLayout(state, request);
  expect([...container.querySelectorAll("a")].find(link => link.textContent?.includes("Open HomeFinder"))?.getAttribute("href")).toBe("/workspace/home-finder?workspaceId=33333333-3333-4333-8333-333333333333");
  expect(container.textContent).toContain("License evidence pending");
});

it("shows a sourced native introduction without making the external System a change target", async () => {
  const state = await snapshot({ id: "evidence", workspaceId: "33333333-3333-4333-8333-333333333333", title: "Evidence", productId: "ai_visibility", resourceKind: "assessment", payload: null, input: {}, createdAt: "2026-10-08T00:00:00Z" });
  state.systems!.systems = [{ ref: { businessId: state.workspaceId, systemId: SYSTEM }, name: "External reference", kind: "website", lifecycle: "draft", basis: "Unverified source", savedWorkId: null, tenantId: null, connectedSite: { siteUrl: "https://example.org/", siteHost: "example.org", verified: false, lastEventAt: null }, health: { status: "unknown", summary: "Control is unverified", lastVerifiedAt: null } }];
  state.systems!.possibilities = [{ id: "new-native", title: "Private native copy", summary: "The source remains unchanged.", status: "exploring", affects: [], sourceSystemIds: [SYSTEM], introduces: ["Native website"], evidence: "HTML source only", previewHref: null, workId: "prepared-copy", stored: true }];
  const projection = readBusinessSystems({ snapshot: state, sites: [] });
  expect(projection.systems[0]!.possibilities[0]).toMatchObject({ id: "new-native", affects: [], introduces: ["Native website"] });
  expect(projection.systems[0]!.health.summary).toBe("Control is unverified");
  expect(projection.systems[0]!.surface).toMatchObject({ liveUrl: "https://example.org/" });
});


it.each([
  { creatorDraft: true, versionReadOnly: false, workspaceStopped: false, editable: true },
  { creatorDraft: false, versionReadOnly: false, workspaceStopped: false, editable: false },
  { creatorDraft: true, versionReadOnly: true, workspaceStopped: false, editable: false },
  { creatorDraft: true, versionReadOnly: undefined, workspaceStopped: false, editable: false },
  { creatorDraft: true, versionReadOnly: false, workspaceStopped: true, editable: false },
])("limits provider System draft editing to exact unblocked creator work: %j", async ({ creatorDraft, versionReadOnly, workspaceStopped, editable }) => {
  const service = createApplicationService(memoryBoundedStore("33333333-3333-4333-8333-333333333333"));
  const saved = await service.create(owner, "33333333-3333-4333-8333-333333333333", { title: "Provider draft", maintenanceOwner: owner.userId, fields: [{ id: "name", label: "Name", type: "text", required: true }], components: [{ kind: "form", fields: ["name"] }] });
  const work = { ...source(saved), creatorDraft };
  const state = await snapshot(work);
  const { systems } = readBusinessSystems({ snapshot: state, sites: [] });
  const request = vi.fn(async () => new Response(JSON.stringify(saved), { status: 200 }));
  await mount(createElement(WorkspaceRequestContext.Provider, { value: request as typeof fetch }, createElement(SystemPage, { system: systems[0], systems, workspaceId: work.workspaceId, sources: [work], readOnly: true, useReadOnly: true, canEditApplications: true, versionReadOnly, workspaceStopped, systemHref: id => `?system=${id}`, onHome: noop, onAsk: noop })));
  expect(container.textContent?.includes("Edit proposed app")).toBe(editable);
  expect(Boolean(button("Check proposed change"))).toBe(editable);
  expect(button("Publish")).toBeUndefined();
  expect(request.mock.calls.length).toBeGreaterThan(0);
});
