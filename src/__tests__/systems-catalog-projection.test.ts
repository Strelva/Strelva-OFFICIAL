import { describe, expect, it } from "vitest";
import {
  clientStorePurpose,
  systemsFromExisting,
  tenantBookingsSystemId,
  withTenantSurfaces,
  type ExistingSystemsSnapshot,
  type TenantSiteFacts,
} from "@/platform/systems";
import { deriveSystemHealth, healthGraphFromSystems } from "@/platform/system-health";
import { savedCheckObservations } from "@/products/investigations/system-health";
import { websiteRebuildCandidate } from "@/products/websites/rebuild-possibility";
import { projectWorkspaceSystems, savedCheckEvidence } from "@/experience/systems/server";
import { readBusinessSystems } from "@/experience/systems/from-workspace";
import type { WorkspaceSnapshot, WorkspaceWork } from "@/experience/workspace/contracts";

const BUSINESS = "7c000000-0000-4000-8000-000000000010";
const AT = "2026-10-01T12:00:00.000Z";
const NOW = Date.parse("2026-10-06T12:00:00.000Z");
const GLDF_STABLE = "7c000000-0000-4000-8000-0000000000b1";
const ROHLAX_STABLE = "7c000000-0000-4000-8000-0000000000b2";
const TRACKER = "7c000000-0000-4000-8000-0000000000a1";
const DOCUMENT = "7c000000-0000-4000-8000-0000000000a2";
const SCHEDULE = "7c000000-0000-4000-8000-0000000000a3";
const CHECK = "7c000000-0000-4000-8000-0000000000a4";
const PRICES = "7c000000-0000-4000-8000-0000000000a5";

const work = (id: string, productId: string, resourceKind: string, title: string | null, extra: Record<string, unknown> = {}) =>
  ({ id, productId, resourceKind, title, createdAt: AT, updatedAt: AT, ...extra });

function snapshot(overrides: Partial<ExistingSystemsSnapshot> = {}): ExistingSystemsSnapshot {
  return {
    businessId: BUSINESS,
    savedWork: [
      work(TRACKER, "tracker", "tracker", "New clients"),
      work(DOCUMENT, "documents", "document", "Intake procedure"),
      work(PRICES, "applications", "application", "Price list", { applicationStatus: "installed", applicationRelease: 1 }),
    ],
    managedWebsites: [
      { link: "tenant_link", tenantStableId: GLDF_STABLE, tenantId: "gldf", siteName: "Great Lakes Dried Fruits", tenantActive: true, linkedAt: AT },
      { link: "tenant_link", tenantStableId: ROHLAX_STABLE, tenantId: "rohlax", siteName: "Rohlax Wellness", tenantActive: true, linkedAt: AT },
    ],
    inquiryWorkspaces: [],
    bookingGrants: [],
    calendarConnections: [],
    ...overrides,
  };
}

const facts = (entries: Array<[string, TenantSiteFacts]>) => new Map(entries);

describe("systems catalog: merges", () => {
  it("keeps the tracker, check and document in the original file list while Systems is off", async () => {
    const listing = systemsFromExisting(snapshot({ managedWebsites: [] }));
    const projection = await projectWorkspaceSystems({ listing, siteDomains: new Map(), candidates: [], observations: [], actorId: BUSINESS, now: NOW });
    const files = [[TRACKER, "tracker", "tracker"], [CHECK, "investigations", "investigation"], [DOCUMENT, "documents", "document"]].map(([id, productId, resourceKind]) =>
      ({ id, workspaceId: BUSINESS, productId, resourceKind, title: "Saved work", createdAt: AT, input: {}, payload: null }) as unknown as WorkspaceWork);
    const view = readBusinessSystems({ snapshot: { workspaceId: BUSINESS, workspaces: [], work: files, delegations: [], systems: projection, releases: { systems: false } }, sites: [] });
    expect(view).toEqual({ systems: [], files, unavailable: false });
  });
  it("lists a tracker as an internal tool and leaves documents out of Systems", () => {
    const { systems } = systemsFromExisting(snapshot());
    const tracker = systems.find(({ references }) => references.savedWorkId === TRACKER)!;
    expect(tracker.system).toMatchObject({ kind: "internal_app", name: "New clients", lifecycle: "live" });
    expect(systems.some(({ references }) => references.savedWorkId === DOCUMENT)).toBe(false);
    expect(systems.some(({ system }) => system.kind === "document" || system.kind === "tracker")).toBe(false);
  });

  it("names an untitled tracker as an internal tool, never a Tracker", () => {
    const { systems } = systemsFromExisting(snapshot({ savedWork: [work(TRACKER, "tracker", "tracker", null)] }));
    expect(systems[0]!.system.name).toBe("Internal tool");
  });

  it("keeps a document a file in the workspace view, and a tracker an app", async () => {
    const listing = systemsFromExisting(snapshot({ managedWebsites: [] }));
    const projection = await projectWorkspaceSystems({ listing, siteDomains: new Map(), candidates: [], observations: [], actorId: BUSINESS, now: NOW });
    const workspaceWork = [TRACKER, DOCUMENT].map((id) => ({ id, workspaceId: BUSINESS, productId: id === TRACKER ? "tracker" : "documents", resourceKind: id === TRACKER ? "tracker" : "document", title: "x", createdAt: AT, input: {}, payload: null }) as unknown as WorkspaceWork);
    const view = readBusinessSystems({
      snapshot: { workspaceId: BUSINESS, workspaces: [], work: workspaceWork, delegations: [], systems: projection, releases: { systems: true } } as Pick<WorkspaceSnapshot, "workspaceId" | "workspaces" | "work" | "delegations" | "systems" | "releases">,
      sites: [],
    });
    expect(view.systems.find((item) => item.surface.kind === "work" && item.surface.workId === TRACKER)?.kind).toBe("app");
    expect(view.files.map((item) => item.id)).toEqual([DOCUMENT]);
  });
});

describe("systems catalog: client store and bookings views", () => {
  it("adds a Store Connection only when the tenant runs a checkout", () => {
    const listing = withTenantSurfaces(systemsFromExisting(snapshot()), facts([
      ["gldf", { features: ["analytics", "commerce"], domain: "greatlakesdriedfruit.com" }],
      ["rohlax", { features: ["analytics"], domain: "rohlaxwellness.com" }],
    ]));
    const stores = listing.connections.filter(({ connection }) => connection.target.type === "api");
    expect(stores).toHaveLength(1);
    const gldf = listing.systems.find(({ references }) => references.tenantId === "gldf")!;
    expect(stores[0]!.connection).toMatchObject({
      kind: "appear", state: "connected", source: { systemId: gldf.system.id },
      target: { type: "api", api: "client-checkout:gldf" },
      purpose: clientStorePurpose("greatlakesdriedfruit.com"),
    });
    expect(stores[0]!.connection.purpose).toContain("Store on greatlakesdriedfruit.com");
    expect(stores[0]!.connection.purpose).toContain("the client's Stripe is the source of truth");
    // Never a System of its own.
    expect(listing.systems).toHaveLength(systemsFromExisting(snapshot()).systems.length);
  });

  it("accepts the legacy shop alias, and claims nothing when the tenant read failed", () => {
    const shop = withTenantSurfaces(systemsFromExisting(snapshot()), facts([["gldf", { features: ["shop"] }]]));
    expect(shop.connections.filter(({ connection }) => connection.target.type === "api")).toHaveLength(1);
    expect(shop.connections[0]!.connection.purpose).toContain("Store on the site");
    const unread = withTenantSurfaces(systemsFromExisting(snapshot()), new Map());
    expect(unread.connections).toEqual([]);
    expect(unread.bookingViews.size).toBe(0);
  });

  it("does not let the store placement change website health", () => {
    const listing = withTenantSurfaces(systemsFromExisting(snapshot()), facts([["gldf", { features: ["commerce"] }]]));
    const graph = healthGraphFromSystems({ systems: listing.systems.map((item) => item.system), connections: listing.connections.map((item) => item.connection), observations: [] });
    expect(graph.connections).toEqual([]);
    expect(graph.resources).toEqual([]);
  });

  it("shows wellness schedule and roster as views of a Bookings System, not Systems", () => {
    const listing = withTenantSurfaces(systemsFromExisting(snapshot()), facts([["rohlax", { features: ["schedule", "roster", "members"] }]]));
    const id = tenantBookingsSystemId(BUSINESS, ROHLAX_STABLE);
    const bookings = listing.systems.find(({ system }) => system.id === id)!;
    expect(bookings.system).toMatchObject({ kind: "booking", name: "Rohlax Wellness bookings", lifecycle: "live", origin: null });
    expect(listing.bookingViews.get(id)).toEqual(["schedule", "roster"]);
    const rohlax = listing.systems.find(({ references }) => references.tenantId === "rohlax" && references.savedWorkId === null && _isWebsite(references.tenantId, listing))!;
    expect(listing.connections.find(({ connection }) => connection.source.systemId === id)!.connection).toMatchObject({
      kind: "appear", target: { type: "system", system: { systemId: rohlax.system.id } },
    });
    expect(listing.systems.filter(({ system }) => system.kind === "booking")).toHaveLength(1);
    // Stable across reads.
    expect(withTenantSurfaces(systemsFromExisting(snapshot()), facts([["rohlax", { features: ["schedule"] }]])).systems.find(({ system }) => system.kind === "booking")!.system.id).toBe(id);
  });

  it("attaches the views to a Bookings System already on that site instead of adding one", () => {
    const withSchedule = snapshot({
      savedWork: [work(SCHEDULE, "scheduling", "schedule", "Classes")],
      bookingGrants: [{ id: "7c000000-0000-4000-8000-0000000000d1", tenantStableId: ROHLAX_STABLE, workId: SCHEDULE, displayName: "Book a class", provider: "google", status: "published" }],
    });
    const listing = withTenantSurfaces(systemsFromExisting(withSchedule), facts([["rohlax", { features: ["roster"] }]]));
    const bookings = listing.systems.filter(({ system }) => system.kind === "booking");
    expect(bookings).toHaveLength(1);
    expect(bookings[0]!.references.savedWorkId).toBe(SCHEDULE);
    expect(listing.bookingViews.get(bookings[0]!.system.id)).toEqual(["roster"]);
  });

  it("sends booking views to the browser and links them to the site's dashboard", async () => {
    const { bookingViews, ...listing } = withTenantSurfaces(systemsFromExisting(snapshot()), facts([["rohlax", { features: ["schedule", "roster"] }]]));
    const projection = await projectWorkspaceSystems({ listing, bookingViews, siteDomains: new Map(), candidates: [], observations: [], actorId: BUSINESS, now: NOW });
    const entry = projection.systems.find((item) => item.kind === "booking")!;
    expect(entry.views).toEqual(["schedule", "roster"]);
    expect(projection.systems.filter((item) => item.kind !== "booking").every((item) => item.views === undefined)).toBe(true);
    const view = readBusinessSystems({
      snapshot: { workspaceId: BUSINESS, workspaces: [], work: [], delegations: [], systems: projection, releases: { systems: true } },
      sites: [{ id: "rohlax", title: "Rohlax Wellness", href: "http://localhost:3000/client/rohlax/dashboard", productId: "managed_presence", relationship: "client" }],
    });
    expect(view.systems.find((item) => item.kind === "bookings")!.views).toEqual([
      { id: "schedule", label: "Day and week schedule", href: "http://localhost:3000/client/rohlax/dashboard/schedule" },
      { id: "roster", label: "Roster", href: "http://localhost:3000/client/rohlax/dashboard/roster" },
    ]);
  });
});

function _isWebsite(tenantId: string | null, listing: ReturnType<typeof withTenantSurfaces>) {
  return listing.systems.some(({ system, references }) => system.kind === "website" && references.tenantId === tenantId);
}

describe("systems catalog: saved checks are health", () => {
  const check = (runs: unknown[], extra: Record<string, unknown> = {}) => ({
    id: CHECK, productId: "investigations", resourceKind: "investigation", title: "Prices on site vs price list",
    payload: {
      version: 1, revision: 1, title: "Prices on site vs price list", createdBy: "actor", createdAt: AT, history: [],
      mode: "comparison", status: "active", intervalMinutes: 1440, nextRunAt: AT,
      sources: [{ workId: PRICES }, { workId: TRACKER }], runs, ...extra,
    },
  });
  const run = (at: string, result: string) => ({ requestId: `r-${at}`, at, result, fingerprint: "f", sources: [{ workId: PRICES, revision: 1, updatedAt: AT }], differences: [] });
  const systems = [{ systemId: "s-prices", savedWorkId: PRICES, domain: null }, { systemId: "s-tracker", savedWorkId: TRACKER, domain: null }, { systemId: "s-other", savedWorkId: DOCUMENT, domain: null }];

  it("reads as evidence of every System it watches, and names a disagreement", () => {
    const observations = savedCheckObservations([check([run(new Date(NOW - 3_600_000).toISOString(), "discrepancy")])], systems);
    expect(observations.map((item) => item.subjectId)).toEqual(["s-prices", "s-tracker"]);
    expect(observations[0]).toMatchObject({ outcome: "warn", source: "saved-check", message: "Prices on site vs price list: the sources disagree.", maxAgeSeconds: 2 * 1440 * 60 });
  });

  it("never reads a stale check as healthy: health says when it last checked", () => {
    const old = "2026-09-20T12:00:00.000Z";
    const observations = savedCheckObservations([check([run(old, "agreement")])], systems);
    const health = deriveSystemHealth({ systems: [{ id: "s-prices", businessId: BUSINESS, name: "Price list", kind: "internal_app", lifecycle: "live", operation: "ongoing" }], connections: [], observations }, NOW).get("s-prices")!;
    expect(health.status).toBe("unknown");
    expect(health.reasons[0]!.message).toContain(`Last checked ${old}`);
    const fresh = savedCheckObservations([check([run(new Date(NOW - 60_000).toISOString(), "agreement")])], systems);
    expect(deriveSystemHealth({ systems: [{ id: "s-prices", businessId: BUSINESS, name: "Price list", kind: "internal_app", lifecycle: "live", operation: "ongoing" }], connections: [], observations: fresh }, NOW).get("s-prices")!.status).toBe("healthy");
  });

  it("is unknown before its first run and skips checks that watch nothing here or cannot be read", () => {
    expect(savedCheckObservations([check([])], systems)[0]).toMatchObject({ outcome: "unknown", observedAt: null, message: "Prices on site vs price list has not run yet." });
    expect(savedCheckObservations([check([], { sources: [{ workId: "7c000000-0000-4000-8000-0000000000ff" }, { workId: "7c000000-0000-4000-8000-0000000000fe" }] })], systems)).toEqual([]);
    expect(savedCheckObservations([{ ...check([]), payload: { broken: true } }], systems)).toEqual([]);
  });

  it("matches a public website check to the website System by address", () => {
    const listing = systemsFromExisting(snapshot());
    const site = listing.systems.find(({ references }) => references.tenantId === "gldf")!;
    const publicCheck = check([run(new Date(NOW - 60_000).toISOString(), "changed")], { mode: "public_website", sources: [{ kind: "public_website", url: "https://www.greatlakesdriedfruit.com/prices" }] });
    const observations = savedCheckEvidence(listing, new Map([["gldf", "greatlakesdriedfruit.com"]]), [publicCheck]);
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({ subjectId: site.system.id, outcome: "warn" });
  });
});

describe("systems catalog: agency drafts are website Possibilities", () => {
  const rebuild = (kinds: string[]) => ({
    id: "7c000000-0000-4000-8000-0000000000c1", productId: "websites", resourceKind: "website", title: "Mooney site",
    payload: {
      version: 2, revision: kinds.length, title: "Mooney site", input: { requestId: "request-0001", url: "https://attymooney.com" },
      status: "review_ready", stages: [], checkpoint: null, candidate: null, approvedCandidateRevision: null, tenantId: "mooney-firm",
      launch: { receipt: null, readBack: null }, lastError: null, createdBy: "actor", createdAt: AT,
      history: kinds.map((kind, index) => ({ revision: index + 1, kind, actorId: "actor", at: AT })),
    },
  });

  it("presents an agency draft made after the last publish as a proposed change to that site", () => {
    const candidate = websiteRebuildCandidate(rebuild(["created", "rebuild_published", "agency_document_draft"]))!;
    expect(candidate.origin).toBe("agency_draft");
    expect(candidate.summary).toContain("your agency prepared under its website draft grant");
    expect(candidate.tenantId).toBe("mooney-firm");
  });

  it("keeps a plain rebuild, or a draft already published, a rebuild", () => {
    expect(websiteRebuildCandidate(rebuild(["created"]))!.origin).toBe("rebuild");
    expect(websiteRebuildCandidate(rebuild(["agency_document_draft", "publish_reconciled", "candidate"]))!.origin).toBe("rebuild");
  });

  it("titles the agency Possibility as one change to one client's site", async () => {
    const listing = systemsFromExisting(snapshot({ managedWebsites: [{ link: "tenant_link", tenantStableId: GLDF_STABLE, tenantId: "mooney-firm", siteName: "The Mooney Firm", tenantActive: true, linkedAt: AT }], savedWork: [] }));
    const candidate = websiteRebuildCandidate(rebuild(["rebuild_published", "agency_document_draft"]))!;
    const projection = await projectWorkspaceSystems({ listing, siteDomains: new Map([["mooney-firm", "attymooney.com"]]), candidates: [candidate], observations: [], actorId: BUSINESS, now: NOW });
    expect(projection.possibilities).toHaveLength(1);
    expect(projection.possibilities[0]).toMatchObject({ title: "A proposed change to attymooney.com", affects: [listing.systems[0]!.system.id] });
  });
});
