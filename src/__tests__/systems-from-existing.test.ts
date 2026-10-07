import { describe, expect, it, vi } from "vitest";
import {
  createMemorySystemStore,
  listBusinessSystems,
  mergeBusinessSystems,
  systemOriginId,
  systemsFromExisting,
  type ExistingSystemsSnapshot,
} from "@/platform/systems";

const BUSINESS = "5e000000-0000-4000-8000-000000000010";
const AT = "2026-10-01T12:00:00+00:00";
const owner = { userId: "5e000000-0000-4000-8000-000000000001", verifiedEmail: "sy-owner@example.test" };
const NATIVE_TENANT = "5e000000-0000-4000-8000-0000000000b1";
const MANAGED_TENANT = "5e000000-0000-4000-8000-0000000000b2";
const work = (id: string, productId: string, resourceKind: string, title: string | null, extra: Record<string, unknown> = {}) =>
  ({ id, productId, resourceKind, title, createdAt: AT, updatedAt: AT, ...extra });

const snapshot: ExistingSystemsSnapshot = {
  businessId: BUSINESS,
  savedWork: [
    work("5e000000-0000-4000-8000-0000000000a2", "websites", "website", "Juniper site",
      { websitePublishedRevision: 3, hostedTenantStableId: NATIVE_TENANT, hostedTenantId: "juniper", hostedTenantReserved: true }),
    work("5e000000-0000-4000-8000-0000000000a3", "scheduling", "schedule", "Tastings"),
    work("5e000000-0000-4000-8000-0000000000a4", "applications", "application", "Orders", { applicationStatus: "installed", applicationRelease: 2 }),
    work("5e000000-0000-4000-8000-0000000000a5", "applications", "application", "Old app", { applicationStatus: "retired" }),
    work("5e000000-0000-4000-8000-0000000000a6", "work_plans", "plan", "A plan"),
    work("5e000000-0000-4000-8000-0000000000a7", "onboarding", "case", "Smith onboarding"),
    work("5e000000-0000-4000-8000-0000000000a8", "documents", "document", null),
  ],
  managedWebsites: [
    { link: "tenant_link", tenantStableId: NATIVE_TENANT, tenantId: "juniper", siteName: "Juniper", tenantActive: true, linkedAt: AT },
    { link: "tenant_link", tenantStableId: MANAGED_TENANT, tenantId: "juniper-catering", siteName: "Juniper Catering", tenantActive: true, linkedAt: AT },
  ],
  inquiryWorkspaces: [{ id: "5e000000-0000-4000-8000-0000000000c1", tenantStableId: MANAGED_TENANT, businessId: "default", createdAt: AT, updatedAt: AT }],
  bookingGrants: [{
    id: "5e000000-0000-4000-8000-0000000000d1", tenantStableId: NATIVE_TENANT, workId: "5e000000-0000-4000-8000-0000000000a3",
    displayName: "Book a tasting", provider: "google", status: "published",
  }],
  calendarConnections: [{ id: "5e000000-0000-4000-8000-0000000000e1", provider: "google", calendarName: "Front desk", status: "error" }],
};

describe("systems from existing things", () => {
  it("lists real Systems for a business and skips work that is not a System", () => {
    const { systems } = systemsFromExisting(snapshot);
    expect(systems.map(({ system }) => [system.name, system.kind, system.lifecycle])).toEqual([
      ["Juniper site", "website", "live"],
      ["Tastings", "booking", "live"],
      ["Orders", "internal_app", "live"],
      ["Juniper Catering", "website", "live"],
      ["Juniper Catering inquiries", "inquiry", "live"],
    ]);
    expect(systems.every(({ provenance }) => provenance === "existing")).toBe(true);
  });

  it("projects an agency's assigned snapshot from its own work only, even if more slips in", () => {
    // The SQL reader already narrows an agency; the projection holds the same
    // line so a broader snapshot can never surface more than the work.
    const site = snapshot.savedWork[0]!;
    const assigned = systemsFromExisting({ ...snapshot, scope: "assigned", savedWork: [site] });
    expect(assigned.systems.map(({ system }) => [system.name, system.origin])).toEqual([
      ["Juniper site", { kind: "saved_work", ref: site.id }],
    ]);
    expect(assigned.systems[0]!.references).toMatchObject({ tenantStableId: NATIVE_TENANT, tenantId: "juniper" });
    expect(assigned.connections).toEqual([]);

    const schedule = snapshot.savedWork[1]!;
    const delegated = systemsFromExisting({ ...snapshot, scope: "assigned", savedWork: [schedule] });
    expect(delegated.systems.map(({ system }) => system.kind)).toEqual(["booking"]);
    // No site it hosts to appear on, and the business's calendars are not its work.
    expect(delegated.connections).toEqual([]);

    // A direct member's snapshot keeps everything.
    expect(systemsFromExisting({ ...snapshot, scope: "business" }).connections.length).toBeGreaterThan(0);
  });

  it("lists a paused schedule's booking System as paused even while it is published on a website", () => {
    const paused = { ...snapshot, savedWork: snapshot.savedWork.map((w) => (w.id.endsWith("a3") ? { ...w, schedulePaused: true } : w)) };
    const booking = systemsFromExisting(paused).systems.find(({ system }) => system.kind === "booking")!;
    expect(booking.system.lifecycle).toBe("paused");
    expect(booking.basis).toMatch(/paused/i);
  });

  it("treats a native website and the tenant it publishes to as one System", () => {
    const { systems } = systemsFromExisting(snapshot);
    const websites = systems.filter(({ system }) => system.kind === "website");
    expect(websites).toHaveLength(2);
    const native = websites.find(({ references }) => references.savedWorkId === "5e000000-0000-4000-8000-0000000000a2")!;
    expect(native.references).toMatchObject({ tenantStableId: NATIVE_TENANT, tenantId: "juniper" });
    expect(native.system.origin).toEqual({ kind: "saved_work", ref: "5e000000-0000-4000-8000-0000000000a2" });
    const managed = websites.find(({ references }) => references.tenantStableId === MANAGED_TENANT)!;
    expect(managed.system.origin).toEqual({ kind: "tenant", ref: MANAGED_TENANT });
  });

  it("references existing identities instead of minting new ones", () => {
    const first = systemsFromExisting(snapshot);
    const second = systemsFromExisting(structuredClone(snapshot));
    expect(second.systems.map(({ system }) => system.id)).toEqual(first.systems.map(({ system }) => system.id));
    for (const { system } of first.systems) expect(system.id).toBe(systemOriginId(BUSINESS, system.origin!));
  });

  it("derives connections: booking appears on the site and reads the calendar binding", () => {
    const { systems, connections } = systemsFromExisting(snapshot);
    const id = (name: string) => systems.find(({ system }) => system.name === name)!.system.id;
    const name = (systemId: string) => systems.find(({ system }) => system.id === systemId)!.system.name;
    const shapes = connections.map(({ connection: c }) => [
      name(c.source.systemId), c.kind, c.target.type === "system" ? name(c.target.system.systemId) : c.target.type, c.state,
    ]);
    expect(shapes).toEqual([
      ["Juniper Catering inquiries", "appear", "Juniper Catering", "connected"],
      ["Tastings", "appear", "Juniper site", "connected"],
      ["Tastings", "read", "account_binding", "stale"],
    ]);
    expect(connections.every(({ connection }) => connection.businessId === BUSINESS && connection.source.businessId === BUSINESS)).toBe(true);
    expect(id("Tastings")).toBeTruthy();
  });

  it("shows a paused managed site and a draft booking honestly", () => {
    const { systems } = systemsFromExisting({
      ...snapshot,
      managedWebsites: [{ ...snapshot.managedWebsites[1]!, tenantActive: false }],
      bookingGrants: [],
    });
    expect(systems.find(({ system }) => system.name === "Juniper Catering")?.system.lifecycle).toBe("paused");
    expect(systems.find(({ system }) => system.name === "Juniper Catering inquiries")?.system.lifecycle).toBe("paused");
    expect(systems.find(({ system }) => system.name === "Tastings")?.system.lifecycle).toBe("draft");
  });

  it("reads inquiry lifecycle as intent and leaves verification to health", () => {
    const inquiryWith = (capabilityStatus: "draft" | "live_unverified" | "live" | "paused" | "failed") =>
      systemsFromExisting({ ...snapshot, inquiryWorkspaces: [{ ...snapshot.inquiryWorkspaces[0]!, capabilityStatus }] })
        .systems.find(({ system }) => system.kind === "inquiry")!;
    expect(inquiryWith("draft").system.lifecycle).toBe("draft");
    expect(inquiryWith("paused").system.lifecycle).toBe("paused");
    expect(inquiryWith("live").system.lifecycle).toBe("live");
    expect(inquiryWith("live_unverified")).toMatchObject({ system: { lifecycle: "live" }, basis: expect.stringMatching(/health/) });
    expect(inquiryWith("failed").system.lifecycle).toBe("live");
    const offline = systemsFromExisting({
      ...snapshot,
      managedWebsites: [{ ...snapshot.managedWebsites[1]!, tenantActive: false }],
      inquiryWorkspaces: [{ ...snapshot.inquiryWorkspaces[0]!, capabilityStatus: "live" }],
    }).systems.find(({ system }) => system.kind === "inquiry")!;
    expect(offline.system.lifecycle).toBe("paused");
  });

  it("merges stored Systems over the projection under the same id", async () => {
    const store = createMemorySystemStore({ access: (actor, businessId) => (businessId === BUSINESS && actor.userId === owner.userId ? "owner" : null) });
    const adopted = await store.createSystem(owner, BUSINESS, {
      name: "Juniper website", kind: "website", origin: { kind: "saved_work", ref: "5e000000-0000-4000-8000-0000000000a2" },
    }, "5e000000-0000-4000-8000-0000000000f1");
    await store.createSystem(owner, BUSINESS, { name: "Catering proposal", kind: "proposal" }, "5e000000-0000-4000-8000-0000000000f2");
    const rpc = vi.fn(async () => ({ data: snapshot, error: null }));
    const listed = await listBusinessSystems(owner, BUSINESS, { store, db: { rpc } });
    expect(rpc).toHaveBeenCalledWith("read_existing_business_systems", expect.objectContaining({ p_workspace_id: BUSINESS, p_user_id: owner.userId }));
    const website = listed.systems.filter(({ system }) => system.id === adopted.id);
    expect(website).toHaveLength(1);
    expect(website[0]).toMatchObject({ provenance: "stored", system: { name: "Juniper website" } });
    expect(listed.systems.map(({ system }) => system.name)).toContain("Catering proposal");
    expect(listed.systems).toHaveLength(6);
  });

  it("keeps connected identity from draft rebuild through hosted launch, without a duplicate website", () => {
    const connectedId = "5e000000-0000-4000-8000-0000000000cc";
    const connected = { id: connectedId, label: "Connected site", siteUrl: "https://connected.example.test/", siteHost: "connected.example.test", status: "active" as const, verifiedAt: AT, lastEventAt: null, createdAt: AT, updatedAt: AT };
    for (const published of [false, true]) {
      const listing = systemsFromExisting({
        businessId: BUSINESS, savedWork: [work("5e000000-0000-4000-8000-0000000000a9", "websites", "website", "Connected rebuild", {
          connectedSiteId: connectedId, ...(published ? { websitePublishedRevision: 1, hostedTenantStableId: NATIVE_TENANT, hostedTenantId: "connected", hostedTenantReserved: true } : {}),
        })], managedWebsites: published ? [{ link: "website_binding", tenantStableId: NATIVE_TENANT, tenantId: "connected", siteName: "Connected", tenantActive: true, linkedAt: AT }] : [],
        connectedSites: [connected], inquiryWorkspaces: [], bookingGrants: [], calendarConnections: [],
      });
      expect(listing.systems).toHaveLength(1);
      expect(listing.systems[0]?.system).toMatchObject({ id: systemOriginId(BUSINESS, { kind: "connected_site", ref: connectedId }), lifecycle: "live" });
      expect(listing.systems[0]?.references).toMatchObject({ connectedSiteId: connectedId, savedWorkId: "5e000000-0000-4000-8000-0000000000a9" });
      expect(listing.connections).toEqual([expect.objectContaining({ connection: expect.objectContaining({
        source: { businessId: BUSINESS, systemId: listing.systems[0]!.system.id }, kind: "read", state: "connected",
        target: { type: "business_resource", resource: "business_record:facts" },
      }) })]);
    }
  });

  it("keeps one website System under one id as a managed site converts", async () => {
    const TENANT = "5e000000-0000-4000-8000-0000000000b7";
    const WORK = "5e000000-0000-4000-8000-0000000000a9";
    const empty = { businessId: BUSINESS, savedWork: [], managedWebsites: [], inquiryWorkspaces: [], bookingGrants: [], calendarConnections: [] };
    const site = (link: "tenant_link" | "website_binding") =>
      ({ link, tenantStableId: TENANT, tenantId: "maple", siteName: "Maple Dental", tenantActive: true, linkedAt: AT });
    const rebuilt = (extra: Record<string, unknown>) => work(WORK, "websites", "website", "Maple Dental rebuild", extra);
    const states: Array<[string, ExistingSystemsSnapshot]> = [
      ["hosted tenant only (binding)", { ...empty, managedWebsites: [site("website_binding")] }],
      ["tenant linked", { ...empty, managedWebsites: [site("tenant_link")] }],
      // The draft rebuild is not tied to the tenant until it publishes there.
      ["linked, native rebuild still a draft", { ...empty, managedWebsites: [site("tenant_link")], savedWork: [rebuilt({})] }],
      ["linked, native rebuild published to it", { ...empty, managedWebsites: [site("tenant_link")],
        savedWork: [rebuilt({ websitePublishedRevision: 1, hostedTenantStableId: TENANT, hostedTenantId: "maple" })] }],
      ["native row only, still hosting the tenant", { ...empty,
        savedWork: [rebuilt({ websitePublishedRevision: 2, hostedTenantStableId: TENANT, hostedTenantId: "maple" })] }],
    ];
    const tenantId = systemOriginId(BUSINESS, { kind: "tenant", ref: TENANT });
    for (const [label, state] of states) {
      const websites = systemsFromExisting(state).systems.filter(({ references }) => references.tenantStableId === TENANT);
      expect(websites.map(({ system }) => system.id), label).toEqual([tenantId]);
    }

    // A System saved while the site was only managed lists once after the rebuild publishes.
    const store = createMemorySystemStore({ access: (actor, businessId) => (businessId === BUSINESS && actor.userId === owner.userId ? "owner" : null) });
    const saved = await store.createSystem(owner, BUSINESS, { name: "Maple website", kind: "website", origin: { kind: "tenant", ref: TENANT } },
      "5e000000-0000-4000-8000-0000000000f3");
    const merged = mergeBusinessSystems(await store.readGraph(owner, BUSINESS), systemsFromExisting(states[3]![1]));
    expect(merged.systems.filter(({ system }) => system.kind === "website").map(({ system, provenance }) => [system.id, provenance]))
      .toEqual([[saved.id, "stored"]]);
  });

  it("keeps a native-first website on its work id after it reserves a hosted tenant", () => {
    const WORK = "5e000000-0000-4000-8000-0000000000aa";
    const TENANT = "5e000000-0000-4000-8000-0000000000b8";
    const empty = { businessId: BUSINESS, savedWork: [], managedWebsites: [], inquiryWorkspaces: [], bookingGrants: [], calendarConnections: [] };
    const draft = systemsFromExisting({ ...empty, savedWork: [work(WORK, "websites", "website", "Oak site")] }).systems;
    const published = systemsFromExisting({ ...empty,
      savedWork: [work(WORK, "websites", "website", "Oak site",
        { websitePublishedRevision: 1, hostedTenantStableId: TENANT, hostedTenantId: "oak", hostedTenantReserved: true })],
      managedWebsites: [{ link: "website_binding", tenantStableId: TENANT, tenantId: "oak", siteName: "Oak", tenantActive: true, linkedAt: AT }],
    }).systems;
    const id = systemOriginId(BUSINESS, { kind: "saved_work", ref: WORK });
    expect(draft.map(({ system }) => system.id)).toEqual([id]);
    expect(published.map(({ system }) => system.id)).toEqual([id]);
  });

  it("merges a System stored under a draft rebuild's work id into the converted site", async () => {
    const TENANT = "5e000000-0000-4000-8000-0000000000b9";
    const WORK = "5e000000-0000-4000-8000-0000000000ab";
    const store = createMemorySystemStore({ access: (actor, businessId) => (businessId === BUSINESS && actor.userId === owner.userId ? "owner" : null) });
    const saved = await store.createSystem(owner, BUSINESS, { name: "Rebuild", kind: "website", origin: { kind: "saved_work", ref: WORK } },
      "5e000000-0000-4000-8000-0000000000f4");
    const merged = mergeBusinessSystems(await store.readGraph(owner, BUSINESS), systemsFromExisting({
      businessId: BUSINESS, bookingGrants: [], calendarConnections: [],
      inquiryWorkspaces: [{ id: "5e000000-0000-4000-8000-0000000000c3", tenantStableId: TENANT, businessId: "default", createdAt: AT, updatedAt: AT }],
      managedWebsites: [{ link: "tenant_link", tenantStableId: TENANT, tenantId: "elm", siteName: "Elm", tenantActive: true, linkedAt: AT }],
      savedWork: [work(WORK, "websites", "website", "Elm rebuild", { websitePublishedRevision: 1, hostedTenantStableId: TENANT, hostedTenantId: "elm" })],
    }));
    expect(merged.systems.filter(({ system }) => system.kind === "website").map(({ system, provenance }) => [system.id, provenance]))
      .toEqual([[saved.id, "stored"]]);
    const appear = merged.connections.map(({ connection }) => connection).find((connection) => connection.kind === "appear")!;
    expect(appear.target).toMatchObject({ type: "system", system: { systemId: saved.id } });
  });

  it("lists inquiries only from tenants this business holds", () => {
    const ELSEWHERE = "5e000000-0000-4000-8000-0000000000ba";
    const { systems } = systemsFromExisting({
      ...snapshot,
      inquiryWorkspaces: [
        ...snapshot.inquiryWorkspaces,
        { id: "5e000000-0000-4000-8000-0000000000c2", tenantStableId: ELSEWHERE, businessId: "default", createdAt: AT, updatedAt: AT },
      ],
    });
    const inquiries = systems.filter(({ system }) => system.kind === "inquiry");
    expect(inquiries.map(({ references }) => references.tenantStableId)).toEqual([MANAGED_TENANT]);
  });
});
