import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));

import { agencySystemLineage, readBusinessSystems } from "@/experience/systems/from-workspace";
import { requestMakeReal, systemHref, type SystemView } from "@/experience/systems/model";
import { SystemPage, websiteSandbox } from "@/experience/systems/SystemPage";
import { pinnedSystems, sectionFromView, placeForSection } from "@/experience/app-frame/workspace-places";
import { publicHostname } from "@/products/managed-presence/hostname";
import type { WorkspaceSnapshot, WorkspaceWork } from "@/experience/workspace/contracts";

const BUSINESS = "business-1";
const work = (id: string, productId: string, extra: Partial<WorkspaceWork> = {}): WorkspaceWork => ({ id, workspaceId: BUSINESS, title: id, productId, resourceKind: "x", payload: null, input: {}, createdAt: "2026-10-01T00:00:00Z", ...extra });
const snapshot = (items: WorkspaceWork[], extra: Partial<WorkspaceSnapshot> = {}): Pick<WorkspaceSnapshot, "workspaceId" | "workspaces" | "work" | "delegations"> => ({
  workspaceId: BUSINESS, workspaces: [{ id: BUSINESS, kind: "customer", name: "The Mooney Firm", role: "owner" }], work: items, delegations: [], ...extra,
});
const mooneySite = { id: "mooney-firm", title: "The Mooney Firm", href: "/dashboard", productId: "managed_presence" as const, relationship: "client" as const, domain: "www.attymooney.com" };

describe("Systems read adapter", () => {
  it("turns the managed site, its inquiries and saved tools into Systems with separate lifecycle and health", () => {
    const { systems, files } = readBusinessSystems({
      snapshot: snapshot([
        work("intake", "applications", { title: "Mediation intake", operation: { status: "installed" } }),
        work("sessions", "scheduling", { title: "Mediation sessions", operation: { status: "draft" } }),
        work("old-tool", "applications", { operation: { status: "retired" } }),
        work("broken", "tracker", { unavailableReason: "This tracker could not be read." }),
        work("check", "ai_visibility"),
      ]),
      sites: [mooneySite],
      inquiryBusinesses: [{ id: "mooney-firm", title: "The Mooney Firm" }],
    });
    expect(systems.map(item => [item.id, item.kind, item.lifecycle, item.health.state])).toEqual([
      ["site:mooney-firm", "website", "live", "unchecked"],
      ["inquiries:mooney-firm", "inquiries", "live", "unchecked"],
      ["work:intake", "app", "live", "unchecked"],
      ["work:sessions", "bookings", "draft", "unchecked"],
      ["work:broken", "tracker", "live", "degraded"],
    ]);
    expect(systems[0]!).toMatchObject({ name: "attymooney.com", surface: { kind: "website", liveUrl: "https://www.attymooney.com", previewSrc: "https://www.attymooney.com" } });
    expect(systems[1]!.connections[0]!).toMatchObject({ kind: "appear", systemId: "site:mooney-firm" });
    // Retired tools and saved results are files, not Systems.
    expect(files.map(item => item.id)).toEqual(["old-tool", "check"]);
  });

  it("never claims health it has not seen, and pauses everything when the workspace stopped", () => {
    const { systems } = readBusinessSystems({ snapshot: snapshot([work("a", "documents")]), sites: [mooneySite], stopped: true, sitesUnavailable: true });
    expect(systems.every(item => item.lifecycle === "paused")).toBe(true);
    expect(systems[0]!.health).toEqual({ state: "degraded", summary: "Website access could not be confirmed just now." });
    expect(systems[1]!.health.state).toBe("unchecked");
  });

  it("makes a saved rebuild a Possibility of the live website, shown from every System it changes", () => {
    const { systems } = readBusinessSystems({
      snapshot: snapshot([work("rebuild", "websites", { title: "attymooney.com rebuild", operation: { status: "review" }, input: { sourceUrl: "https://attymooney.com/", candidatePreviewHref: "/preview/strelva/rebuild/site?example=mooney" } })]),
      sites: [mooneySite],
      inquiryBusinesses: [{ id: "mooney-firm", title: "The Mooney Firm" }],
    });
    expect(systems).toHaveLength(2);
    const site = systems[0]!; const inquiries = systems[1]!;
    expect(site.possibilities).toEqual([expect.objectContaining({ id: "work:rebuild", status: "ready", affects: ["site:mooney-firm", "inquiries:mooney-firm"], previewSrc: "/preview/strelva/rebuild/site?example=mooney" })]);
    expect(inquiries.possibilities.map(item => item.id)).toEqual(["work:rebuild"]);
  });

  it("drops a candidate preview that is not same-origin", () => {
    const { systems } = readBusinessSystems({ snapshot: snapshot([work("rebuild", "websites", { input: { sourceUrl: "attymooney.com", candidatePreviewHref: "https://evil.example/x" } })]), sites: [mooneySite] });
    expect(systems[0]!.possibilities[0]!.previewSrc).toBeUndefined();
    expect(systems[0]!.possibilities[0]!.status).toBe("exploring");
  });

  it("keeps an unmatched website build as its own draft website", () => {
    const { systems } = readBusinessSystems({ snapshot: snapshot([work("new-site", "websites", { title: "New site" })]), sites: [] });
    expect(systems).toEqual([expect.objectContaining({ id: "work:new-site", kind: "website", lifecycle: "draft" })]);
  });

  it("shows two location websites on one account as Versions of each other (Twin Trees)", () => {
    const { systems } = readBusinessSystems({ snapshot: snapshot([]), sites: [
      { ...mooneySite, id: "twintrees-camillus", title: "Twin Trees Camillus", domain: undefined },
      { ...mooneySite, id: "twintrees-fayetteville", title: "Twin Trees Fayetteville", domain: undefined },
    ] });
    expect(systems[0]!.versions).toEqual([expect.objectContaining({ systemId: "site:twintrees-fayetteville", relation: "version" })]);
    expect(systems[1]!.versions[0]!.systemId).toBe("site:twintrees-camillus");
    expect(systems[0]!.surface).toMatchObject({ kind: "website", previewSrc: undefined });
  });

  it("records lineage only from a source link, never from a matching title", () => {
    const { systems } = readBusinessSystems({ snapshot: snapshot([work("intake", "applications", { sourceWorkId: "source" }), work("Mediation intake", "applications")]), sites: [] });
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
    id: "site:mooney-firm", kind: "website", name: "attymooney.com", detail: "The Mooney Firm", lifecycle: "live",
    health: { state: "unchecked", summary: "No recent check is recorded for this system." },
    surface: { kind: "website", domain: "attymooney.com", liveUrl: "https://www.attymooney.com", previewSrc: "https://www.attymooney.com", previewLabel: "attymooney.com, as visitors see it now", manageHref: "/dashboard" },
    operatedBy: "Strelva", connections: [], versions: [],
    possibilities: [{ id: "work:rebuild", title: "A rebuilt attymooney.com", summary: "Rebuilt.", status: "ready", affects: ["site:mooney-firm"], previewSrc: "/preview/x" }],
  };
  const render = (overrides: Partial<Parameters<typeof SystemPage>[0]> = {}) => renderToStaticMarkup(createElement(SystemPage, {
    system: site, systems: [site], workspaceId: BUSINESS, readOnly: false, sources: [], systemHref: id => systemHref("", BUSINESS, id), onHome: () => undefined, onAsk: () => undefined, ...overrides,
  }));

  it("says activation is not connected and that nothing changed", () => {
    const result = requestMakeReal({ title: "A rebuilt attymooney.com" });
    expect(result.status).toBe("not_connected");
    expect(result.message).toMatch(/^Activation is not connected yet\. Nothing changed/);
  });

  it("gives the website most of the page and puts the four nouns beside it", () => {
    const html = render();
    expect(html).toContain("<h1");
    expect(html).toContain("attymooney.com");
    expect(html).toContain('title="attymooney.com as visitors see it"');
    for (const heading of ["Connections", "Possibilities", "Versions", "Make real", "Compare", "Website controls", "Ask for a change"]) expect(html).toContain(heading);
    expect(html).toContain("Live");
    expect(html).toContain("Not checked here yet");
  });

  it("disables changes and Make real with a visible reason for read-only access", () => {
    const html = render({ readOnly: true, readOnlyReason: "Only The Mooney Firm owners can make changes." });
    expect(html).toContain("Only The Mooney Firm owners can make changes.");
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
