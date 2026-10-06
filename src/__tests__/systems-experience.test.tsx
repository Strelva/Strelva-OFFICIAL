import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));

import { agencySystemLineage, readBusinessSystems } from "@/experience/systems/from-workspace";
import { makeRealSummary, systemHref, type SystemView } from "@/experience/systems/model";
import { SystemPage, websiteSandbox } from "@/experience/systems/SystemPage";
import { pinnedSystems, sectionFromView, placeForSection } from "@/experience/app-frame/workspace-places";
import { publicHostname } from "@/products/managed-presence/hostname";
import type { WorkspaceMakeRealResult, WorkspaceSnapshot, WorkspaceSystemEntry, WorkspaceSystems, WorkspaceWork } from "@/experience/workspace/contracts";

const BUSINESS = "a0000000-0000-4000-8000-000000000001";
const SITE = "51000000-0000-4000-8000-000000000001";
const INBOX = "51000000-0000-4000-8000-000000000002";
const INTAKE_SYSTEM = "51000000-0000-4000-8000-000000000003";
const work = (id: string, productId: string, extra: Partial<WorkspaceWork> = {}): WorkspaceWork => ({ id, workspaceId: BUSINESS, title: id, productId, resourceKind: "x", payload: null, input: {}, createdAt: "2026-10-01T00:00:00Z", ...extra });
const entry = (systemId: string, kind: string, name: string, extra: Partial<WorkspaceSystemEntry> = {}): WorkspaceSystemEntry => ({
  ref: { businessId: BUSINESS, systemId }, name, kind, lifecycle: "live", basis: null, savedWorkId: null, tenantId: null,
  health: { status: "unknown", summary: "Nothing has checked this yet.", lastVerifiedAt: null }, ...extra,
});
const projection = (extra: Partial<WorkspaceSystems> = {}): WorkspaceSystems => ({ status: "ready", systems: [], connections: [], possibilities: [], ...extra });
const snapshot = (items: WorkspaceWork[], systems?: WorkspaceSystems): Pick<WorkspaceSnapshot, "workspaceId" | "workspaces" | "work" | "delegations" | "systems"> => ({
  workspaceId: BUSINESS, workspaces: [{ id: BUSINESS, kind: "customer", name: "The Mooney Firm", role: "owner" }], work: items, delegations: [], ...(systems ? { systems } : {}),
});
const mooneySite = { id: "mooney-firm", title: "The Mooney Firm", href: "/dashboard", productId: "managed_presence" as const, relationship: "client" as const, domain: "www.attymooney.com" };
const mooney = projection({
  systems: [
    entry(SITE, "website", "The Mooney Firm", { tenantId: "mooney-firm", health: { status: "healthy", summary: "The latest checks passed.", lastVerifiedAt: "2026-10-05T14:00:00Z" } }),
    entry(INBOX, "inquiry", "The Mooney Firm inquiries"),
    entry(INTAKE_SYSTEM, "internal_app", "Mediation intake", { savedWorkId: "intake" }),
  ],
  connections: [{ id: "c1", sourceId: INBOX, kind: "appear", targetSystemId: SITE, targetLabel: "The Mooney Firm", state: "connected", purpose: "Inquiry form on the site" }],
  possibilities: [{ id: "website-rebuild:rebuild", title: "A rebuilt attymooney.com", summary: "Rebuilt.", status: "ready", affects: [SITE, INBOX], evidence: "12 of 12 public pages carried over.", previewHref: "/api/websites/rebuild/preview", workId: "rebuild" }],
});

describe("Systems read adapter over the spine projection", () => {
  it("draws the server's Systems by spine id, with lifecycle and health as separate marks", () => {
    const { systems, files, unavailable } = readBusinessSystems({
      snapshot: snapshot([work("intake", "applications", { title: "Mediation intake", operation: { status: "installed" } }), work("rebuild", "websites"), work("check", "ai_visibility")], mooney),
      sites: [mooneySite],
    });
    expect(unavailable).toBe(false);
    expect(systems.map(item => [item.id, item.kind, item.name, item.lifecycle, item.health.state])).toEqual([
      [SITE, "website", "attymooney.com", "live", "healthy"],
      [INBOX, "inquiries", "The Mooney Firm inquiries", "live", "unknown"],
      [INTAKE_SYSTEM, "app", "Mediation intake", "live", "unknown"],
    ]);
    expect(systems[0]!).toMatchObject({ detail: "The Mooney Firm", surface: { kind: "website", liveUrl: "https://www.attymooney.com", previewSrc: "https://www.attymooney.com", manageHref: "/dashboard" }, operatedBy: "Strelva" });
    // The inquiry inbox opens for the tenant of the site its form appears on.
    expect(systems[1]!.surface).toEqual({ kind: "inquiries", tenantId: "mooney-firm" });
    expect(systems[1]!.connections[0]!).toMatchObject({ kind: "appear", systemId: SITE, sentence: "Inquiry form on the site", status: "connected" });
    expect(systems[0]!.connections[0]!).toMatchObject({ systemId: INBOX, direction: "in", sentence: "The Mooney Firm inquiries: Inquiry form on the site." });
    expect(systems[2]!.surface).toEqual({ kind: "work", workId: "intake", productId: "applications" });
    // The rebuild is a Possibility, not a file or a second website.
    expect(files.map(item => item.id)).toEqual(["check"]);
  });

  it("shows one Possibility from every System it changes, with a same-origin candidate only", () => {
    const { systems } = readBusinessSystems({ snapshot: snapshot([], mooney), sites: [mooneySite] });
    expect(systems[0]!.possibilities).toEqual([expect.objectContaining({ id: "website-rebuild:rebuild", status: "ready", affects: [SITE, INBOX], previewSrc: "/api/websites/rebuild/preview" })]);
    expect(systems[1]!.possibilities.map(item => item.id)).toEqual(["website-rebuild:rebuild"]);
    const hostile = projection({ ...mooney, possibilities: [{ ...mooney.possibilities[0]!, previewHref: "https://evil.example/x" }] });
    expect(readBusinessSystems({ snapshot: snapshot([], hostile), sites: [mooneySite] }).systems[0]!.possibilities[0]!.previewSrc).toBeUndefined();
  });

  it("claims nothing when the spine could not be read, and has no Systems for a workspace without a projection", () => {
    const down = readBusinessSystems({ snapshot: snapshot([work("intake", "applications")], projection({ status: "unavailable" })), sites: [mooneySite] });
    expect(down).toEqual({ systems: [], files: [expect.objectContaining({ id: "intake" })], unavailable: true });
    expect(readBusinessSystems({ snapshot: snapshot([work("intake", "applications")]), sites: [] })).toMatchObject({ systems: [], unavailable: false });
  });

  it("pauses every System when the workspace stopped, without touching health", () => {
    const { systems } = readBusinessSystems({ snapshot: snapshot([], mooney), sites: [mooneySite], stopped: true });
    expect(systems.every(item => item.lifecycle === "paused")).toBe(true);
    expect(systems[0]!.health.state).toBe("healthy");
  });

  it("shows two location websites on one account as Versions of each other (Twin Trees)", () => {
    const twin = projection({ systems: [entry(SITE, "website", "Twin Trees Camillus", { tenantId: "camillus" }), entry(INBOX, "website", "Twin Trees Fayetteville", { tenantId: "fayetteville" })] });
    const { systems } = readBusinessSystems({ snapshot: snapshot([], twin), sites: [
      { ...mooneySite, id: "camillus", title: "Twin Trees Camillus", domain: undefined },
      { ...mooneySite, id: "fayetteville", title: "Twin Trees Fayetteville", domain: undefined },
    ] });
    expect(systems[0]!.versions).toEqual([expect.objectContaining({ systemId: INBOX, relation: "version" })]);
    expect(systems[0]!.surface).toMatchObject({ kind: "website", previewSrc: undefined });
  });

  it("records lineage only from a source link, never from a matching title", () => {
    const apps = projection({ systems: [entry(SITE, "internal_app", "intake", { savedWorkId: "intake" }), entry(INBOX, "internal_app", "Mediation intake", { savedWorkId: "Mediation intake" })] });
    const { systems } = readBusinessSystems({ snapshot: snapshot([work("intake", "applications", { sourceWorkId: "source" }), work("Mediation intake", "applications")], apps), sites: [] });
    expect(systems[0]!.versions[0]!.lineage).toContain("Adapted from a source system");
    expect(systems[1]!.versions).toEqual([]);

    const lineage = agencySystemLineage([work("source", "applications", { title: "Intake for practices" })], [
      { workspace: { id: "mooney", name: "The Mooney Firm" }, work: [work("m", "applications", { sourceWorkId: "source" })] },
      { workspace: { id: "harbor", name: "Harbor Dental" }, work: [work("Intake for practices", "applications"), work("audit", "ai_visibility")] },
    ]);
    expect(lineage.sources[0]!.versions.map(item => item.businessName)).toEqual(["The Mooney Firm"]);
    expect(lineage.unlinked.map(item => item.work.id)).toEqual(["Intake for practices"]);
  });
});

describe("Make real and the System page", () => {
  const site: SystemView = {
    id: SITE, kind: "website", name: "attymooney.com", detail: "The Mooney Firm", lifecycle: "live",
    health: { state: "unknown", summary: "Nothing has checked this yet." },
    surface: { kind: "website", domain: "attymooney.com", liveUrl: "https://www.attymooney.com", previewSrc: "https://www.attymooney.com", previewLabel: "attymooney.com, as visitors see it now", manageHref: "/dashboard" },
    operatedBy: "Strelva", connections: [], versions: [],
    possibilities: [{ id: "website-rebuild:rebuild", title: "A rebuilt attymooney.com", summary: "Rebuilt.", status: "ready", affects: [SITE], previewSrc: "/preview/x" }],
  };
  const render = (overrides: Partial<Parameters<typeof SystemPage>[0]> = {}) => renderToStaticMarkup(createElement(SystemPage, {
    system: site, systems: [site], workspaceId: BUSINESS, readOnly: false, canMakeReal: true, sources: [], systemHref: id => systemHref("", BUSINESS, id), onHome: () => undefined, onAsk: () => undefined, ...overrides,
  }));

  it("says outside effects are not connected and nothing live changed", () => {
    const result: WorkspaceMakeRealResult = { isolated: true, status: "in_progress", headline: "In progress: 2 of 5 steps.", done: [], waiting: [], unknown: [], notStarted: [], liveUnchanged: true, notConnected: [] };
    expect(makeRealSummary(result)).toBe("Outside effects aren\u2019t connected yet, so this ran on an isolated copy. Your live systems are unchanged. Nothing was published, sent, booked or charged.");
  });

  it("gives the website most of the page and puts the four nouns beside it", () => {
    const html = render();
    expect(html).toContain("<h1");
    expect(html).toContain('title="attymooney.com as visitors see it"');
    for (const heading of ["Connections", "Possibilities", "Versions", "Make real", "Compare", "Website controls", "Ask for a change"]) expect(html).toContain(heading);
    expect(html).toContain("Live");
    expect(html).toContain("Unknown. Nothing has checked this yet.");
    expect(html).not.toContain("Not checked here yet");
  });

  it("gives a non-owner a visible permission state on Make real", () => {
    const html = render({ readOnly: true, canMakeReal: false, readOnlyReason: "Ask an owner or admin to make changes.", makeRealReason: "Only an owner of this business can make a possibility real." });
    expect(html).toContain("Only an owner of this business can make a possibility real.");
    expect(html.match(/<button[^>]*disabled=""[^>]*>[^]*?Make real/)).not.toBeNull();
  });

  it("explains a missing System without leaking another business", () => {
    const html = render({ system: undefined });
    expect(html).toContain("This system isn’t available here.");
    expect(html).not.toContain("attymooney.com");
  });

  it("keeps privileges off anything served from Strelva's own origin", () => {
    expect(websiteSandbox("https://www.attymooney.com")).toContain("allow-scripts");
    expect(websiteSandbox("/preview/strelva/rebuild/site")).toBe("");
    expect(websiteSandbox("https://app.strelva.com/x")).toBe("");
    expect(websiteSandbox("javascript:alert(1)")).toBe("");
  });
});

describe("System places and hostnames", () => {
  it("routes view=system and pins Systems by name with the open one current", () => {
    expect(sectionFromView("system")).toBe("system");
    expect(placeForSection("system")).toBe("system");
    const pinned = pinnedSystems([{ id: "site:a", name: "attymooney.com", kind: "website" }, { id: "work:b", name: "Mediation intake", kind: "app" }], id => `/s/${id}`, undefined, "work:b");
    expect(pinned).toEqual([
      expect.objectContaining({ title: "attymooney.com", href: "/s/site:a", kind: "website", current: false }),
      expect.objectContaining({ title: "Mediation intake", current: true }),
    ]);
    expect(systemHref("", BUSINESS, "site:a")).toBe(`/workspace?view=system&system=site%3Aa&workspaceId=${BUSINESS}`);
  });

  it("only lets a plain public hostname leave the server", () => {
    expect(publicHostname("https://www.AttyMooney.com/contact")).toBe("www.attymooney.com");
    expect(publicHostname("javascript:alert(1)")).toBeUndefined();
    expect(publicHostname("localhost")).toBeUndefined();
    expect(publicHostname("evil.com\" onload=")).toBeUndefined();
    expect(publicHostname(42)).toBeUndefined();
  });
});
