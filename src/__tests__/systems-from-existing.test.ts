import { describe, expect, it, vi } from "vitest";
import {
  createMemorySystemStore,
  listBusinessSystems,
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
      { websitePublishedRevision: 3, hostedTenantStableId: NATIVE_TENANT, hostedTenantId: "juniper" }),
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
      ["Document", "document", "draft"],
      ["Juniper Catering", "website", "live"],
      ["Juniper Catering inquiries", "inquiry", "live"],
    ]);
    expect(systems.every(({ provenance }) => provenance === "existing")).toBe(true);
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
    expect(listed.systems).toHaveLength(7);
  });
});
