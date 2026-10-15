// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/experience/workspace/WorkPlanExperience", () => ({ WorkPlanExperience: () => null }));

import type { BuiltInAppReleaseView } from "@/platform/app-releases/contracts";
import { readBusinessSystems } from "@/experience/systems/from-workspace";
import { SystemPage } from "@/experience/systems/SystemPage";
import { AskStrelva } from "@/experience/ask/AskStrelva";
import { WorkspaceRecaps } from "@/experience/recaps/WorkspaceRecaps";
import { DocumentExperience, type DocumentTransport } from "@/experience/workspace/DocumentExperience";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { createDocument } from "@/products/documents/contracts";
import type { WorkspaceSnapshot, WorkspaceSystemEntry, WorkspaceSystems } from "@/experience/workspace/contracts";

const BUSINESS = "a0000000-0000-4000-8000-000000000001";
const BOOKING = "51000000-0000-4000-8000-000000000011";
const INTERNAL = "51000000-0000-4000-8000-000000000012";
const entry = (systemId: string, kind: string, name: string, extra: Partial<WorkspaceSystemEntry> = {}): WorkspaceSystemEntry => ({
  ref: { businessId: BUSINESS, systemId }, name, kind, lifecycle: "live", basis: null, savedWorkId: null, tenantId: null,
  health: { status: "unknown", summary: "Nothing has checked this yet.", lastVerifiedAt: null }, ...extra,
});
const bookings: BuiltInAppReleaseView = { appId: "bookings", name: "Bookings", release: 1, latest: 1, label: "Bookings Release 1", requiredConnections: [] };
const internalTools: BuiltInAppReleaseView = { appId: "internal_tools", name: "Internal tools", release: 1, latest: 1, label: "Internal tools Release 1", requiredConnections: [] };
const snapshot = (systems: WorkspaceSystems): Pick<WorkspaceSnapshot, "workspaceId" | "workspaces" | "work" | "delegations" | "systems" | "releases"> => ({
  workspaceId: BUSINESS, workspaces: [{ id: BUSINESS, kind: "customer", name: "The Mooney Firm", role: "owner" }], work: [], delegations: [], systems,
  releases: { systems: true, apps: { bookings, internal_tools: internalTools } },
});
const projection = (extra: Partial<WorkspaceSystems> = {}): WorkspaceSystems => ({ status: "ready", systems: [entry(BOOKING, "booking", "Consult booking"), entry(INTERNAL, "internal_app", "Team intake")], connections: [], possibilities: [], ...extra });

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); Element.prototype.scrollTo = () => undefined; });
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
async function render(element: React.ReactNode) {
  const node = document.createElement("div"); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(element));
  return node;
}

describe("built-in App Release on System pages", () => {
  it("labels a Bookings System and never an internal tool", () => {
    const { systems } = readBusinessSystems({ snapshot: snapshot(projection()), sites: [] });
    expect(systems.find(item => item.id === BOOKING)?.builtInApp?.label).toBe("Bookings Release 1");
    expect(systems.find(item => item.id === INTERNAL)?.builtInApp).toBeUndefined();
  });

  it("never labels a Library Version (stored lineage)", () => {
    const versions = [{ id: "v1", systemId: BOOKING, source: { businessId: "other", hidden: false, name: "Source" }, baselineRevision: 1, latestRevision: 1, declined: [], context: { label: "Camillus" }, siblings: [] }] as never;
    const { systems } = readBusinessSystems({ snapshot: snapshot(projection({ versions })), sites: [] });
    expect(systems.find(item => item.id === BOOKING)?.builtInApp).toBeUndefined();
  });

  it("shows no label when the snapshot carries no Releases", () => {
    const base = snapshot(projection());
    const { systems } = readBusinessSystems({ snapshot: { ...base, releases: { systems: true } }, sites: [] });
    expect(systems.every(item => !item.builtInApp)).toBe(true);
  });

  it("renders the Release in the System meta in place of the kind label", async () => {
    const { systems } = readBusinessSystems({ snapshot: snapshot(projection()), sites: [] });
    // A titled surface (the work-only surface has no kind label to replace).
    const system = { ...systems.find(item => item.id === BOOKING)!, surface: { kind: "newsletter" as const, audience: "Everyone" } };
    const request = vi.fn<typeof fetch>(async () => Response.json({ error: "none" }, { status: 503 }));
    const node = await render(<WorkspaceRequestContext.Provider value={request}><SystemPage system={system} systems={systems} workspaceId={BUSINESS} readOnly={false} sources={[]} systemHref={id => `/systems/${id}`} onHome={() => undefined} onAsk={() => undefined} /></WorkspaceRequestContext.Provider>);
    expect(node.textContent).toContain("Bookings Release 1");
    expect(node.textContent).not.toContain("Bookings Release 1 · Bookings");
    const plain = await render(<WorkspaceRequestContext.Provider value={request}><SystemPage system={{ ...system, builtInApp: undefined }} systems={systems} workspaceId={BUSINESS} readOnly={false} sources={[]} systemHref={id => `/systems/${id}`} onHome={() => undefined} onAsk={() => undefined} /></WorkspaceRequestContext.Provider>);
    expect(plain.textContent).not.toContain("Release 1");
  });
});

describe("Release label in other headers", () => {
  it("Ask shows it, and is unchanged without it", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ conversations: [] }));
    const withRelease = await render(<AskStrelva workspaceId={BUSINESS} businessName="The Mooney Firm" request={request} release="Ask Strelva Release 1" />);
    expect(withRelease.textContent).toContain("Ask Strelva Release 1");
    const without = await render(<AskStrelva workspaceId={BUSINESS} businessName="The Mooney Firm" request={request} />);
    expect(without.textContent).not.toContain("Release 1");
  });

  it("Recaps shows it in the header meta", async () => {
    const node = await render(<WorkspaceRecaps workspaceId={BUSINESS} state={{ kind: "loading" }} period="all" releaseLabel="Recaps Release 1" />);
    expect(node.textContent).toContain("Recaps Release 1");
    const plain = await render(<WorkspaceRecaps workspaceId={BUSINESS} state={{ kind: "loading" }} period="all" />);
    expect(plain.textContent).not.toContain("Recaps Release 1");
  });

  it("Documents shows it in the header meta", async () => {
    const doc = createDocument({ title: "Shared procedure", text: "v0" }, "owner");
    const workId = "33333333-3333-4333-8333-333333333333";
    const transport: DocumentTransport = { mode: "server", read: vi.fn(async () => ({ workId, workspaceId: BUSINESS, document: doc, historyEnabled: true })), write: vi.fn(), history: vi.fn() } as never;
    const node = await render(createElement(DocumentExperience, { workspaceId: BUSINESS, workId, transport, readOnly: true, releaseLabel: "Documents Release 1" }));
    expect(node.textContent).toContain("Documents Release 1");
  });
});
