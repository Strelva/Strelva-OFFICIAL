import { describe, expect, it, vi } from "vitest";
import { createInMemoryConnectionOwnership, createInMemoryVersionStore, createSystemVersions, type VersionActor } from "@/platform/system-versions";
import { createMemorySystemStore } from "@/platform/systems";
import { commandGoogleLocationVersions, googleVersionDraftCurrent, googleLocationDefinitionSchema, type GoogleLocationVersionsDeps, type GoogleVersionPin } from "@/products/google-listing/versions";
import type { PublishingSnapshot } from "@/products/publishing/server";

const id = (n: number) => `5e000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const agency = id(10), business = id(11), second = id(12);
const actor = { userId: id(1), verifiedEmail: "operator@example.test" };
const hours = { weekly: [{ day: 1, opens: "09:00", closes: "17:00" }], timezone: "America/New_York" };
const definition = { kind: "google_listing" as const, hours, post: { topicType: "STANDARD" as const, summary: "Shared post" } };
const post = { topicType: "STANDARD" as const, summary: "Updated shared post" };

async function fixture(twoBusinesses = false) {
  const versionActor: VersionActor = { ...actor, memberships: [agency, business, second].map(businessId => ({ businessId, role: "admin" as const })) };
  const store = createInMemoryVersionStore();
  const versions = createSystemVersions({ store, connections: createInMemoryConnectionOwnership() });
  const systems = createMemorySystemStore({ access: () => "admin" });
  const snapshots = new Map<string, PublishingSnapshot>();
  const prepared: Array<{ input: Parameters<GoogleLocationVersionsDeps["prepare"]>[1]; pin: GoogleVersionPin; hours: unknown }> = [];
  for (const [index, workspaceId, locationId] of [[0, business, "camillus"], [1, twoBusinesses ? second : business, "fayetteville"]] as const) {
    const snapshot = snapshots.get(workspaceId) ?? { businessId: workspaceId, scope: "business", bindings: [], receipts: [] };
    snapshot.bindings.push({ id: id(20 + index), workspaceId, provider: "google", subject: null, originTenantStableId: id(30 + index), originTenantId: locationId, scopes: null, tokenExpiresAt: null, status: "connected", lastCheckedAt: null, lastError: null, migratedFrom: "oauth", createdAt: "2026-10-07", updatedAt: "2026-10-07", locations: [{ accountId: `accounts/${locationId}`, locationId, title: locationId, isPrimary: true }] });
    snapshots.set(workspaceId, snapshot);
  }
  const deps: GoogleLocationVersionsDeps = {
    store, versions, systems, actor: async () => versionActor, enabled: async () => true,
    snapshot: async (_actor, workspaceId) => snapshots.get(workspaceId)!,
    source: async (_actor, input) => ({ source: { businessId: input.businessId, systemId: (await systems.createSystem(actor, input.businessId, { name: input.name, kind: input.kind }, input.commandId)).id }, hidden: input.hidden }),
    prepare: vi.fn<GoogleLocationVersionsDeps["prepare"]>(async (_actor, input, options) => {
      prepared.push({ input, pin: options!.pin, hours: options!.hours });
      return { id: `approval-${input.locationId}`, tenantId: input.tenantId, source: "google", type: "content_update", title: "Review", status: "pending", body: "Frozen copy", createdAt: "2026-10-07" };
    }),
  };
  const result = await commandGoogleLocationVersions(actor, { action: "publish", workspaceId: agency, name: "Shared Google listing", definition, summary: "Shared defaults", commandId: id(100) }, deps);
  if (!result.source || !result.revision) throw new Error("Missing source");
  const source = result.source;
  const versionRows = [];
  for (const [index, workspaceId, locationId] of [[0, business, "camillus"], [1, twoBusinesses ? second : business, "fayetteville"]] as const) {
    await commandGoogleLocationVersions(actor, { action: "share", workspaceId: agency, sourceSystemId: source.systemId, businessId: workspaceId }, deps);
    const attached = await commandGoogleLocationVersions(actor, { action: "attach", workspaceId, sourceWorkspaceId: agency, sourceSystemId: source.systemId, revision: 1, bindingId: id(20 + index), locationId, label: locationId, commandId: id(110 + index) }, deps);
    if (!attached.lineage) throw new Error("Missing lineage");
    versionRows.push(attached.lineage);
  }
  return { deps, versionActor, versions, store, source, versionRows, snapshots, prepared };
}

describe("Google locations reuse contextual Versions", () => {
  it.each([false, true])("offers one post with isolated per-location approvals (two businesses: %s)", async twoBusinesses => {
    const f = await fixture(twoBusinesses);
    await commandGoogleLocationVersions(actor, { action: "publish", workspaceId: agency, sourceSystemId: f.source.systemId, name: "Shared", expectedSourceRevision: 1, definition: { ...definition, post }, summary: "New post", commandId: id(120) }, f.deps);
    const result = await commandGoogleLocationVersions(actor, { action: "prepare", workspaceId: agency, sourceSystemId: f.source.systemId, revision: 2, kind: "post", versions: f.versionRows.map(row => ({ workspaceId: row.version.businessId, versionId: row.id, expectedRowRevision: row.rowRevision })), commandId: id(121) }, f.deps);
    expect(result).toMatchObject({ results: [{ status: "needs_approval", eventId: "approval-camillus" }, { status: "needs_approval", eventId: "approval-fayetteville" }] });
    expect(f.prepared.map(row => row.input.locationId)).toEqual(["camillus", "fayetteville"]);
    expect(new Set(f.prepared.map(row => row.input.commandId)).size).toBe(2);
    expect(f.prepared.map(row => row.input.post)).toEqual([post, post]);
    for (const row of f.versionRows) {
      const view = await f.versions.readVersion(f.versionActor, row.id);
      expect(view.currentRelease).toBeNull();
      expect(view.bindings).toEqual([]);
      expect(view.localData).toEqual({});
    }
    const graph = await f.deps.systems.readGraph(actor, business);
    expect(graph.systems.filter(row => row.kind === "listing")).toHaveLength(twoBusinesses ? 1 : 2);
  });

  it("keeps local hours until an explicit conflict choice, without blocking the other location", async () => {
    const f = await fixture();
    const row = f.versionRows[0]!;
    const localHours = { ...hours, weekly: [{ day: 1, opens: "10:00", closes: "18:00" }] };
    const overridden = await f.versions.setOverride(f.versionActor, row.id, { path: "hours", value: localHours, expectedRowRevision: row.rowRevision });
    const newHours = { ...hours, weekly: [{ day: 1, opens: "08:00", closes: "16:00" }] };
    await f.versions.publishSourceRevision(f.versionActor, { source: f.source, definition: { ...definition, hours: newHours }, summary: "New hours" });
    const input = { action: "prepare", workspaceId: agency, sourceSystemId: f.source.systemId, revision: 2, kind: "hours", versions: [{ workspaceId: business, versionId: row.id, expectedRowRevision: overridden.rowRevision }, { workspaceId: business, versionId: f.versionRows[1]!.id, expectedRowRevision: 1 }], commandId: id(122) };
    expect(await commandGoogleLocationVersions(actor, input, f.deps)).toMatchObject({ results: [{ status: "blocked", reason: expect.stringContaining("overlaps") }, { status: "needs_approval" }] });
    expect(f.prepared[0]!.hours).toEqual(newHours);
    expect(await commandGoogleLocationVersions(actor, { ...input, versions: [{ ...input.versions[0], resolutions: [{ path: "hours", choice: "keep_local" }] }], commandId: id(123) }, f.deps)).toMatchObject({ results: [{ status: "needs_approval" }] });
    expect(f.prepared[1]!.hours).toEqual(localHours);
  });

  it("pins the exact Version, target and frozen copy, and refuses stale drafts", async () => {
    const f = await fixture();
    const row = f.versionRows[0]!;
    await commandGoogleLocationVersions(actor, { action: "prepare", workspaceId: agency, sourceSystemId: f.source.systemId, revision: 1, kind: "post", versions: [{ workspaceId: business, versionId: row.id, expectedRowRevision: 1 }], commandId: id(124) }, f.deps);
    const pin = f.prepared[0]!.pin;
    const input = { workspaceId: business, locationId: "camillus", bindingId: id(20), pin, draft: { action: "post", post: definition.post } };
    expect(await googleVersionDraftCurrent(input, f.store)).toBe(true);
    expect(await googleVersionDraftCurrent({ ...input, locationId: "fayetteville" }, f.store)).toBe(false);
    expect(await googleVersionDraftCurrent({ ...input, workspaceId: second }, f.store)).toBe(false);
    expect(await googleVersionDraftCurrent({ ...input, bindingId: id(21) }, f.store)).toBe(false);
    expect(await googleVersionDraftCurrent({ ...input, draft: { action: "post", post } }, f.store)).toBe(false);
    await f.versions.setOverride(f.versionActor, row.id, { path: "post", value: post, expectedRowRevision: 1 });
    expect(await googleVersionDraftCurrent(input, f.store)).toBe(false);
  });

  it("refuses flags, unshared sources, wrong workspaces, and disconnected locations", async () => {
    const f = await fixture(true);
    const row = f.versionRows[0]!;
    const input = { action: "prepare", workspaceId: agency, sourceSystemId: f.source.systemId, revision: 1, kind: "post", versions: [{ workspaceId: second, versionId: row.id, expectedRowRevision: 1 }], commandId: id(125) };
    expect(await commandGoogleLocationVersions(actor, input, f.deps)).toMatchObject({ results: [{ status: "blocked" }] });
    await expect(commandGoogleLocationVersions(actor, input, { ...f.deps, enabled: async () => false })).rejects.toThrow("not enabled");
    await f.versions.unshareSource(f.versionActor, f.source, second);
    await expect(commandGoogleLocationVersions(actor, { action: "attach", workspaceId: second, sourceWorkspaceId: agency, sourceSystemId: f.source.systemId, revision: 1, bindingId: id(21), locationId: "fayetteville", label: "Different", commandId: id(126) }, f.deps)).rejects.toThrow();
    f.snapshots.get(business)!.bindings[0]!.status = "revoked";
    expect(await commandGoogleLocationVersions(actor, { ...input, versions: [{ ...input.versions[0], workspaceId: business }] }, f.deps)).toMatchObject({ results: [{ status: "blocked", reason: expect.stringContaining("own Google account") }] });
    expect(f.prepared).toHaveLength(0);
  });

  it("does not treat a source author's grant or a member's read access as management authority", async () => {
    const f = await fixture();
    const member = { ...f.versionActor, memberships: [{ businessId: agency, role: "admin" as const }, { businessId: business, role: "member" as const }] };
    expect(await commandGoogleLocationVersions(actor, { action: "prepare", workspaceId: agency, sourceSystemId: f.source.systemId, revision: 1, kind: "post", versions: [{ workspaceId: business, versionId: f.versionRows[0]!.id, expectedRowRevision: 1 }], commandId: id(127) }, { ...f.deps, actor: async () => member })).toMatchObject({ results: [{ status: "blocked" }] });
    expect(f.prepared).toHaveLength(0);
  });

  it("rejects secrets, targets and policy inside a shared definition", () => {
    for (const key of ["bindingId", "locationId", "refreshToken", "replyMode", "records"]) {
      expect(googleLocationDefinitionSchema.safeParse({ ...definition, [key]: "secret" }).success).toBe(false);
    }
  });
});
