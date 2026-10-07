// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgencyHome } from "@/experience/workspace/AgencyHome";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import type { AgencyClientRow, AgencyClientsPage, AgencyLibrary } from "@/experience/workspace/agency-clients";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));

const AGENCY = "11111111-1111-4111-8111-111111111111";
const uuid = (prefix: string, index: number) => `${prefix}-0000-4000-8000-${String(index).padStart(12, "0")}`;
const roots: ReturnType<typeof createRoot>[] = [];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Anything outside the agency reads (inbox, drafts, allowances) answers empty.
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ requests: [], applications: [], websites: [] })));
});
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

function snapshot(systems: boolean): WorkspaceSnapshot {
  return {
    actor: { email: "ops@example.com", localPreview: false }, workspaceId: AGENCY,
    workspaces: [{ id: AGENCY, kind: "agency", name: "Strelva", access: "member", role: "owner" }],
    work: [], handoffs: [], delegations: [], products: [], releases: { systems },
  };
}

function row(index: number, extra: Partial<AgencyClientRow> = {}): AgencyClientRow {
  return {
    workspaceId: uuid("c0000000", index), name: `Client ${index}`, reach: "member", role: "admin", provider: false, status: "ready",
    systems: [{ id: uuid("51000000", index), name: `client${index}.example`, kind: "website", lifecycle: "live", versionContext: null }],
    needsYou: { count: 0, oldestAt: null }, openRequests: 0, improvementsWaiting: 0, lastReceiptAt: null, ...extra,
  };
}

const page = (clients: AgencyClientRow[], extra: Partial<AgencyClientsPage> = {}): AgencyClientsPage => (
  { agencyWorkspaceId: AGENCY, clients, queue: [], team: [], total: clients.length, nextCursor: null, providersRead: true, ...extra });

const library: AgencyLibrary = {
  agencyWorkspaceId: AGENCY,
  sources: [{
    systemId: uuid("53000000", 1), workspaceId: AGENCY, name: "Inquiry intake", hidden: false,
    revisions: [{ number: 4, label: "Follow-up", summary: "Follow up after one business day.", publishedAt: "2026-10-04T12:00:00.000Z" }],
    versions: [
      { versionId: "ready-1", workspaceId: uuid("c0000000", 1), clientName: "Lake Bakery", systemId: uuid("52000000", 1), systemName: "Inquiry intake", context: { kind: "agency_client", label: "Lake Bakery" }, baselineRevision: 3, currentRelease: 1, state: "ready", conflicts: [], missingBindings: [], declinedReason: null },
      { versionId: "conflict", workspaceId: uuid("c0000000", 2), clientName: "The Mooney Firm", systemId: uuid("52000000", 2), systemName: "Inquiry intake", context: { kind: "agency_client", label: "The Mooney Firm" }, baselineRevision: 3, currentRelease: 1, state: "conflicts", conflicts: [{ path: "followUp.message", local: "We'll call you within one business day", upstream: "Someone will reply by the end of the next business day." }], missingBindings: [], declinedReason: null },
      { versionId: "missing", workspaceId: uuid("c0000000", 3), clientName: "Elmwood PT", systemId: uuid("52000000", 3), systemName: "Inquiry intake", context: { kind: "agency_client", label: "Elmwood PT" }, baselineRevision: 3, currentRelease: 1, state: "missing_accounts", conflicts: [], missingBindings: ["google_calendar"], declinedReason: null },
    ],
  }],
};

async function render(request: typeof fetch, systems = true, onWorkspace = vi.fn()) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => {
    root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(AgencyHome, {
      snapshot: snapshot(systems), busy: false, onWorkspace, onOpenClientWork: vi.fn(), onOpenWork: vi.fn(), onStart: vi.fn(),
    })));
  });
  await settle();
  return { node, onWorkspace };
}
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); }); }
const clientCalls = (request: ReturnType<typeof vi.fn>) => request.mock.calls.filter(([input]) => String(input).startsWith("/api/workspace/agency-clients"));
const button = (node: HTMLElement, name: string | RegExp) => [...node.querySelectorAll("button")].find((item) => typeof name === "string" ? item.textContent?.trim() === name || item.getAttribute("aria-label") === name : name.test(item.textContent || ""))!;

function router(handlers: { clients?: () => Response | Promise<Response>; library?: () => Response; review?: (body: unknown) => Response }) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/workspace/agency-clients")) return handlers.clients ? handlers.clients() : Response.json(page([]));
    if (url.startsWith("/api/workspace/agency-library") && (init?.method || "GET") === "POST") return handlers.review!(JSON.parse(String(init!.body)));
    if (url.startsWith("/api/workspace/agency-library")) return handlers.library ? handlers.library() : Response.json({ agencyWorkspaceId: AGENCY, sources: [] });
    return Response.json({ requests: [], applications: [], websites: [] });
  });
}

describe("agency home on the batched read", () => {
  it("shows health independently of lifecycle and names incomplete Queue sources", async () => {
    const request = router({ clients: () => Response.json(page([row(1, { systems: [{ id: uuid("51000000", 1), name: "Client website", kind: "website", lifecycle: "live", versionContext: null,
      health: { status: "blocked", summary: "Domain is down", lastVerifiedAt: "2026-10-07T12:00:00.000Z" } }] })], {
      queueComplete: false, queueGaps: ["Owner approvals: unavailable"], queue: [{ id: "decision:1", kind: "owner_email", workspaceId: uuid("c0000000", 1), clientName: "Client 1",
        title: "Owner email bounced: new booking flow", systemId: uuid("51000000", 1), workId: null, since: "2026-10-07T12:00:00.000Z" }],
    })) });
    const { node } = await render(request);
    expect(node.textContent).toContain("Client website · Live · Blocked");
    await act(async () => button(node, "Queue").click());
    expect(node.textContent).toContain("Owner email bounced: new booking flow");
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("This Queue is incomplete");
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("Owner approvals: unavailable");
  });
  it("loads 50 clients with one request and renders every row", async () => {
    const request = router({ clients: () => Response.json(page(Array.from({ length: 50 }, (_, index) => row(index + 1)))) });
    const { node } = await render(request);
    expect(clientCalls(request)).toHaveLength(1);
    expect(node.querySelectorAll('[aria-label="Clients"] > li')).toHaveLength(50);
    expect(node.textContent).toContain("50 clients");
    expect(node.textContent).not.toContain("Show more clients");
  });

  it("names an unavailable client, keeps the others, and retries by refetching", async () => {
    let reads = 0;
    const request = router({ clients: () => {
      reads += 1;
      return Response.json(page([row(1, { name: "Twin Trees", provider: true }), row(2, { name: "McClear’s", status: "unavailable", systems: [] }), row(3)].map((item) => reads > 1 ? { ...item, status: "ready" as const } : item)));
    } });
    const { node, onWorkspace } = await render(request);
    expect(node.textContent).toContain("McClear’s could not be loaded.");
    expect(node.textContent).toContain("Twin Trees");
    expect(node.textContent).toContain("Operated by Strelva");
    expect(node.textContent).toContain("Client 3");
    await act(async () => { button(node, "Retry loading McClear’s").click(); });
    await settle();
    expect(clientCalls(request)).toHaveLength(2);
    expect(node.textContent).not.toContain("could not be loaded");
    await act(async () => { button(node, /^Twin Trees/).click(); });
    expect(onWorkspace).toHaveBeenCalledWith(row(1).workspaceId);
  });

  it("shows Show more clients only when the server returns a cursor", async () => {
    const request = router({ clients: () => Response.json(page([row(1)], { total: 2, nextCursor: "1" })) });
    const { node } = await render(request);
    expect(node.textContent).toContain("Showing 1 of 2 clients");
    request.mockImplementation(async () => Response.json(page([row(2)], { total: 2 })));
    await act(async () => { button(node, "Show more clients").click(); });
    await settle();
    expect(String(request.mock.calls.at(-1)![0])).toContain("cursor=1");
    expect(node.textContent).toContain("Client 2");
    expect(node.textContent).not.toContain("Show more clients");
  });

  it("says the whole read failed without claiming access changed, and retries", async () => {
    const request = router({ clients: () => Response.json({ error: "down" }, { status: 503 }) });
    const { node } = await render(request);
    expect(node.textContent).toContain("Clients could not be loaded. Access has not changed.");
    await act(async () => { button(node, "Retry").click(); });
    await settle();
    expect(clientCalls(request)).toHaveLength(2);
  });

  it("refuses a malformed clients response", async () => {
    const request = router({ clients: () => Response.json({ agencyWorkspaceId: AGENCY, clients: "everyone" }) });
    const { node } = await render(request);
    expect(node.textContent).toContain("Clients could not be loaded. Access has not changed.");
    expect(node.querySelector('[aria-label="Clients"]')).toBeNull();
  });

  it("Library shows conflicts side by side and Review all sends only ready Versions", async () => {
    const bodies: unknown[] = [];
    const request = router({
      clients: () => Response.json(page([row(1)])),
      library: () => Response.json(library),
      review: (body) => { bodies.push(body); return Response.json({ sourceSystemId: library.sources[0]!.systemId, revision: 4, results: [{ versionId: "ready-1", workspaceId: uuid("c0000000", 1), clientName: "Lake Bakery", outcome: "prepared", detail: "" }] }); },
    });
    const { node } = await render(request);
    await act(async () => { button(node, "Library").click(); });
    await settle();
    expect(node.textContent).toContain("1 ready · 1 has conflicts · 1 missing accounts");
    expect(node.textContent).toContain("“We'll call you within one business day”");
    expect(node.textContent).toContain("“Someone will reply by the end of the next business day.”");
    expect(node.textContent).toContain("Needs Google Calendar connected first");
    const conflictLink = [...node.querySelectorAll("a")].find(link => link.textContent === "Open The Mooney Firm’s System")!;
    expect(conflictLink.getAttribute("href")).toBe(`/workspace?view=system&system=${uuid("52000000", 2)}&workspaceId=${uuid("c0000000", 2)}`);
    await act(async () => { button(node, "Review all").click(); });
    await settle();
    expect(bodies).toEqual([{ action: "review_all", workspaceId: AGENCY, sourceSystemId: library.sources[0]!.systemId, revision: 4, versionIds: ["ready-1"] }]);
    const results = node.querySelector('[aria-label="Review all results"]')!.textContent!;
    expect(results).toContain("Prepared. Waiting on the owner’s approval.");
    expect(results).toContain("The Mooney FirmSkipped. Needs a choice on 1 change.");
    expect(results).toContain("Elmwood PTSkipped. Needs Google Calendar connected first.");
  });

  it("shows existing inquiry Versions through the current agency Library tab", async () => {
    const request = router({ clients: () => Response.json(page([])), library: () => Response.json({ agencyWorkspaceId: AGENCY, sources: [],
      inquiryVersions: [{ id: "legacy-inquiry", tenantId: "lake-bakery", businessName: "Lake Bakery", name: "Ask us",
        sourceBusinessId: AGENCY, sourceSystemId: "inquiry:source", sourceRevision: 2, currentRelease: 7, improvement: "blocked" }] }) });
    const { node } = await render(request);
    await act(async () => { button(node, "Library").click(); }); await settle();
    expect(node.textContent).toContain("Inquiry Versions");
    expect(node.textContent).toContain("Source revision 2 · this Version’s release 7");
    expect(node.textContent).toContain("choice about local changes");
    expect(node.querySelector('a[href="/business/lake-bakery?view=patterns"]')?.textContent).toContain("Lake Bakery");
    expect(node.textContent).not.toContain("No sources yet");
  });
  it("keeps Library and Team out when the Systems release is off, with clients still from one read", async () => {
    const request = router({ clients: () => Response.json(page([row(1), row(2)])) });
    const { node } = await render(request, false);
    expect(node.querySelector('[role="tablist"]')).toBeNull();
    expect(button(node, "Library")).toBeUndefined();
    expect(node.textContent).toContain("Client 2");
    expect(clientCalls(request)).toHaveLength(1);
    expect(request.mock.calls.some(([input]) => String(input).startsWith("/api/workspace/agency-library"))).toBe(false);
  });
});
