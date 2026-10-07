import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));

import { readBusinessSystems } from "@/experience/systems/from-workspace";
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
const snapshot = (items: WorkspaceWork[], systems?: WorkspaceSystems, released = true): Pick<WorkspaceSnapshot, "workspaceId" | "workspaces" | "work" | "delegations" | "systems" | "releases"> => ({
  workspaceId: BUSINESS, workspaces: [{ id: BUSINESS, kind: "customer", name: "The Mooney Firm", role: "owner" }], work: items, delegations: [], ...(systems ? { systems } : {}), releases: { systems: released },
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

describe("Systems read adapter with STRELVA_SYSTEMS_RELEASE off", () => {
  it("draws no System, Possibility or Version and keeps every saved result a file, even if a projection arrives", () => {
    const items = [work("intake", "applications", { title: "Mediation intake", sourceWorkId: "source" }), work("rebuild", "websites"), work("check", "ai_visibility")];
    const off = readBusinessSystems({ snapshot: snapshot(items, mooney, false), sites: [mooneySite] });
    expect(off).toEqual({ systems: [], files: items, unavailable: false });
    const down = readBusinessSystems({ snapshot: snapshot(items, projection({ status: "unavailable" }), false), sites: [mooneySite] });
    expect(down.unavailable).toBe(false);
  });

  it("treats a snapshot without releases as off", () => {
    const { releases: _releases, ...legacy } = snapshot([], mooney);
    expect(readBusinessSystems({ snapshot: legacy, sites: [mooneySite] }).systems).toEqual([]);
  });
});

describe("Systems read adapter over the spine projection", () => {
  it("shows the business facts boundary for repo-only, native content, and hosted websites", () => {
    for (const scenario of [
      { editing: "request" as const, savedWorkId: null, status: "not_connected", sentence: "Strelva updates this site by hand" },
      { editing: "native" as const, savedWorkId: null, status: "not_connected", sentence: "native website content" },
      { editing: "native" as const, savedWorkId: "document", status: "not_connected", sentence: "not connected", businessFactsConnected: false },
      { editing: "native" as const, savedWorkId: "document", status: "connected", sentence: "when it renders", businessFactsConnected: true },
    ]) {
      const mapped = readBusinessSystems({ snapshot: snapshot([], projection({ systems: [entry(SITE, "website", "The Mooney Firm", { tenantId: "mooney-firm", editing: scenario.editing, savedWorkId: scenario.savedWorkId, businessFactsConnected: scenario.businessFactsConnected })] })), sites: [mooneySite] });
      const facts = mapped.systems[0]!.connections.find(connection => connection.target === "Business record")!;
      expect(facts).toMatchObject({ kind: "read", status: scenario.status, contract: { sourceOfTruth: "The business record's confirmed facts" } });
      expect(facts.sentence).toContain(scenario.sentence);
      expect(facts.contract?.authority).toContain("no contacts");
    }
  });
  it("enriches a connected site's existing business facts read once after it becomes hosted", () => {
    const mapped = readBusinessSystems({ snapshot: snapshot([], projection({
      systems: [entry(SITE, "website", "Connected website", { tenantId: "mooney-firm", savedWorkId: "document", businessFactsConnected: true, connectedSite: { siteUrl: "https://attymooney.com", siteHost: "attymooney.com", verified: true, lastEventAt: null } })],
      connections: [{ id: "facts", sourceId: SITE, kind: "read", targetSystemId: null, targetLabel: "Business record", state: "connected", purpose: "Confirmed facts from the business record are filled into the site" }],
    })), sites: [mooneySite] });
    expect(mapped.systems[0]!.connections).toEqual([expect.objectContaining({ id: "facts", target: "Business record", status: "connected", sentence: "This website reads confirmed business facts when it renders." })]);
  });
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
    const signedTry = projection({ ...mooney, possibilities: [{ ...mooney.possibilities[0]!, tryHref: "/try/signed-candidate" }] });
    expect(readBusinessSystems({ snapshot: snapshot([], signedTry), sites: [mooneySite] }).systems[0]!.possibilities[0]).toMatchObject({ openHref: "/try/signed-candidate", previewSrc: "/api/websites/rebuild/preview" });
    const hostileTry = projection({ ...mooney, possibilities: [{ ...mooney.possibilities[0]!, tryHref: "https://evil.example/x" }] });
    expect(readBusinessSystems({ snapshot: snapshot([], hostileTry), sites: [mooneySite] }).systems[0]!.possibilities[0]!.openHref).toBe(`/workspace?workspaceId=${BUSINESS}&view=websites&work=rebuild`);
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

  it("records lineage only from stored Version rows, never from sourceWorkId or a matching title", () => {
    const apps = projection({ systems: [entry(SITE, "internal_app", "intake", { savedWorkId: "intake" }), entry(INBOX, "internal_app", "Mediation intake", { savedWorkId: "Mediation intake" })] });
    const { systems } = readBusinessSystems({ snapshot: snapshot([work("intake", "applications", { sourceWorkId: "source" }), work("Mediation intake", "applications")], apps), sites: [] });
    expect(systems[0]!.versions).toEqual([]);
    expect(systems[1]!.versions).toEqual([]);
  });

  it("draws stored Versions: the source, the context, siblings and a waiting improvement (Twin Trees)", () => {
    const twin = projection({
      systems: [entry(SITE, "website", "Twin Trees Camillus", { tenantId: "camillus" }), entry(INBOX, "website", "Twin Trees Fayetteville", { tenantId: "fayetteville" })],
      versions: [
        { id: "v-c", systemId: SITE, source: { businessId: BUSINESS, systemId: "hidden", name: "Twin Trees website", hidden: true }, context: { kind: "location", label: "Camillus" },
          baselineRevision: 2, latestRevision: 2, currentRelease: 1, declined: [], siblings: [{ id: "v-f", systemId: INBOX, context: { kind: "location", label: "Fayetteville" } }] },
        { id: "v-f", systemId: INBOX, source: { businessId: BUSINESS, systemId: "hidden", name: "Twin Trees website", hidden: true }, context: { kind: "location", label: "Fayetteville" },
          baselineRevision: 1, latestRevision: 2, currentRelease: 1, declined: [], siblings: [{ id: "v-c", systemId: SITE, context: { kind: "location", label: "Camillus" } }] },
      ],
    });
    const { systems } = readBusinessSystems({ snapshot: snapshot([], twin), sites: [
      { ...mooneySite, id: "camillus", title: "Twin Trees Camillus", domain: undefined },
      { ...mooneySite, id: "fayetteville", title: "Twin Trees Fayetteville", domain: undefined },
    ] });
    const fayetteville = systems.find(item => item.id === INBOX)!;
    expect(fayetteville.versions[0]).toMatchObject({ relation: "source", context: "Fayetteville" });
    expect(fayetteville.versions[0]!.lineage).toContain("An improvement is waiting");
    expect(fayetteville.versions[1]).toMatchObject({ relation: "version", systemId: SITE, context: "Camillus" });
    // Stored rows replace the synthetic "not linked yet" siblings.
    expect(JSON.stringify(systems)).not.toContain("not linked between them yet");
    expect(systems.find(item => item.id === SITE)!.versions[0]!.lineage).not.toContain("waiting");
  });
});

describe("stored Make real on the System views", () => {
  it("puts each activation on every System it changes, and History newest first with receipts for that System", () => {
    const { systems } = readBusinessSystems({ snapshot: snapshot([], projection({ ...mooney,
      activations: [{ id: "a1", possibilityId: "p1", title: "A rebuilt attymooney.com", status: "needs_attention", headline: "Partly live", partlyLive: true, done: 3, total: 5, affects: [SITE, INBOX], lines: [] }],
      history: [
        { id: "r1", systemId: SITE, sentence: "Strelva started running it", at: "2026-10-01T12:00:00Z" },
        { id: "r2", systemId: SITE, sentence: "Website content changed", at: "2026-10-03T12:00:00Z" },
      ],
      handled: [{ id: "h1", systemId: SITE, sentence: "Strelva: Publish the rebuilt attymooney.com", at: "2026-10-05T12:00:00Z", undo: "Undo from History" }],
      possibilities: [{ ...mooney.possibilities[0]!, id: "p1", stored: true, status: "exploring", staleReason: "attymooney.com changed since this was built." }],
    })), sites: [mooneySite] });
    const site = systems.find(item => item.id === SITE)!;
    expect(site.activations).toEqual([expect.objectContaining({ id: "a1", headline: "Partly live" })]);
    expect(systems.find(item => item.id === INBOX)!.activations).toHaveLength(1);
    expect(systems.find(item => item.id === INTAKE_SYSTEM)!.activations).toBeUndefined();
    expect(site.history!.map(row => row.sentence)).toEqual(["Strelva: Publish the rebuilt attymooney.com", "Website content changed", "Strelva started running it"]);
    expect(site.possibilities[0]!.staleReason).toBe("attymooney.com changed since this was built.");
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
    for (const heading of ["Possibilities", "Make real", "Compare", "Website controls", "Ask for a change"]) expect(html).toContain(heading);
    expect(html).toContain("Live");
    expect(html).toContain("Unknown. Nothing has checked this yet.");
    expect(html).not.toContain("Not checked here yet");
  });

  it("opens managed change review instead of asking owners to edit", () => {
    const native = render({ system: { ...site, surface: { ...site.surface, editing: "native" } as SystemView["surface"] } });
    expect(native).toContain(`href="/workspace/site?workspaceId=${BUSINESS}&amp;system=${SITE}&amp;tab=request"`);
    expect(native).toContain(">Changes to this site<");
    expect(native).not.toContain(">Edit site<");
    expect(native).not.toContain("Website controls");
    expect(native).not.toContain(`tab=connections`);
    const repo = render({ system: { ...site, surface: { ...site.surface, editing: "request" } as SystemView["surface"] }, appBase: "/preview/strelva" });
    expect(repo).toContain(`href="/preview/strelva/workspace/site?workspaceId=${BUSINESS}&amp;system=${SITE}&amp;tab=request"`);
    expect(repo).toContain(">Changes to this site<");
  });

  it("carries how the site changes from the projection to the System page", () => {
    const withEditing = projection({ systems: [entry(SITE, "website", "The Mooney Firm", { tenantId: "mooney-firm", editing: "request" })] });
    const [system] = readBusinessSystems({ snapshot: snapshot([], withEditing), sites: [mooneySite] }).systems;
    expect(system!.surface).toMatchObject({ kind: "website", editing: "request" });
    const [unknown] = readBusinessSystems({ snapshot: snapshot([], mooney), sites: [mooneySite] }).systems;
    expect(unknown!.surface).not.toHaveProperty("editing");
  });

  it("draws no empty panel, and with nothing beside the thing shows one line under it", () => {
    const html = render();
    for (const empty of [">Connections<", ">Versions<", ">History<", ">Making it live<", "Nothing else is connected to it yet", "It runs in one context today"]) expect(html).not.toContain(empty);
    expect(html).not.toContain("Ask what else attymooney.com could become.");
    // A website always has its own panels (domains, requests, history), so the bare case is another kind.
    const bare = render({ system: { ...site, kind: "app", possibilities: [] } });
    expect(bare).not.toContain(">Possibilities<");
    expect(bare).not.toContain("<aside");
    expect(bare).toContain("Ask what else attymooney.com could become.");
  });

  it("folds working Connections into one line and shows anything not working in full", () => {
    const html = render({ system: { ...site, connections: [
      { id: "c1", kind: "appear", target: "Inquiries", sentence: "Inquiries arrive from the website.", status: "connected" },
      { id: "c2", kind: "read", target: "Business record", sentence: "Reads the business hours.", status: "connected" },
      { id: "c3", kind: "act", target: "Google", sentence: "Posts to Google.", status: "not_connected" },
    ] } });
    expect(html).toContain("Works with 2 things");
    expect(html).toMatch(/Posts to Google\.[^]*Not connected/);
    expect(html.indexOf("Posts to Google.")).toBeLessThan(html.indexOf("Works with 2 things"));
  });

  it("renders a misconfigured domain's contract without changing the website lifecycle", () => {
    const html = render({ system: { ...site, lifecycle: "live" }, websiteDetail: { status: "ready", detail: {
      systemId: SITE, domains: [{ hostname: "attymooney.com", state: "misconfigured", label: "DNS misconfigured", lastCheckedAt: "2026-10-07T00:00:00Z", whoCanChange: "The owner, with their registrar" }], waiting: [], requests: [], history: [], unavailable: [],
    } } });
    expect(html).toContain("The website appears at attymooney.com");
    expect(html).toContain("Not connected");
    expect(html).toContain("Source: Domain claims");
    expect(html).toContain("Changes are owner-decided");
    expect(html).toContain("Last checked 2026-10-07T00:00:00Z");
    expect(html).toContain("not the website&#x27;s lifecycle");
    expect(html).toContain('data-lifecycle="live"');
  });

  it("shows Make real in progress step by step, then History, in the spec's order", () => {
    const html = render({ system: { ...site,
      activations: [{ id: "a1", title: "Consult booking", headline: "Partly live", partlyLive: true, done: 3, total: 4, lines: [
        { label: "Publish the booking page", state: "Done", detail: null },
        { label: "Add the booking link on Google", state: "Waiting", detail: "Google hasn't approved Strelva's access yet." },
      ] }],
      history: [{ id: "h1", sentence: "Strelva started running it", at: "2026-10-01T12:00:00Z" }],
    } });
    expect(html).toContain("Making it live");
    expect(html).toContain("Partly live");
    expect(html).toContain("Waiting: Google hasn&#x27;t approved Strelva&#x27;s access yet.");
    expect(html).toContain("History");
    expect(html).toContain("Strelva started running it");
    expect(html).not.toMatch(/>Version[^s]/);
    const order = ["Making it live", ">Possibilities<", ">History<"].map((text) => html.indexOf(text));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("says what keeps working while paused, and a stale possibility says why", () => {
    const html = render({ system: { ...site, kind: "bookings", lifecycle: "paused", surface: { kind: "work", workId: "w", productId: "unknown" },
      possibilities: [{ ...site.possibilities[0]!, status: "exploring", staleReason: "attymooney.com changed since this was built." }] } });
    expect(html).toContain("Paused. Bookings already made are kept.");
    expect(html).toContain("attymooney.com changed since this was built. Strelva is refreshing it.");
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

  it("lists a website's audits beside it and leaves the panel out when there are none", () => {
    expect(render()).not.toContain(">Audits<");
    const html = render({ system: { ...site, audits: [{ workId: "audit-1", title: "Website audit · AI visibility", at: "2026-09-08T12:00:00Z" }] } });
    expect(html).toContain("Audits");
    expect(html).toContain("Website audit · AI visibility");
    expect(html).toContain("work=audit-1");
  });

  it("opens a Bookings System's schedule and roster on the site, and says when a view cannot open here", () => {
    const bookings: SystemView = {
      id: INBOX, kind: "bookings", name: "Rohlax Wellness bookings", detail: "Time people can reserve", lifecycle: "live",
      health: { state: "unknown", summary: "Nothing has checked this yet." },
      surface: { kind: "work", workId: INBOX, productId: "unknown" }, connections: [], versions: [], possibilities: [],
      views: [{ id: "schedule", label: "Day and week schedule", href: "http://localhost:3000/client/rohlax/dashboard/schedule" }, { id: "roster", label: "Roster" }],
    };
    const html = render({ system: bookings, systems: [bookings] });
    expect(html).toContain('href="http://localhost:3000/client/rohlax/dashboard/schedule"');
    expect(html).toContain("Roster · not available from here");
    expect(html).not.toContain("There is nothing to open for this system here yet");
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
