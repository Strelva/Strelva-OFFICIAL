import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertInstalledSystemConnections } from "@/platform/system-versions/live-system-connections";
import { createSystemStoreLiveSystems, createInMemoryRevisionContent } from "@/platform/make-real/systems-adapter";
import { createMemorySystemStore } from "@/platform/systems/memory-store";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), lineage: vi.fn(), assert: vi.fn(async () => {}) }));
vi.mock("@/platform/system-versions/supabase-store", () => ({ readVersionActor: mocks.actor, createSupabaseVersionStore: () => ({ findLineageByVersion: mocks.lineage }) }));
vi.mock("@/platform/system-versions/required-connections", () => ({ assertRequiredConnections: mocks.assert }));
const actor = { userId: "bb000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const businessId = "bb000000-0000-4000-8000-000000000002", systemId = "bb000000-0000-4000-8000-000000000003";
beforeEach(() => { vi.clearAllMocks(); mocks.actor.mockResolvedValue({ ...actor, memberships: [] }); });
describe("generic Make real installed-System guard", () => {
  it("derives the installed definition's needs before generic activation", async () => {
    mocks.lineage.mockResolvedValue({ version: { businessId, systemId }, baseline: { definition: { kind: "internal_app", title: "Requests", fields: [], components: [] } }, overrides: [], releases: [], bindings: [] });
    await assertInstalledSystemConnections(actor, { businessId, systemId });
    expect(mocks.assert).toHaveBeenCalledWith({ actor, workspaceId: businessId, requiredConnections: [expect.objectContaining({ provider: "resend", optional: false })], connectionRefs: [] });
  });
  it("does not impose App requirements on a System with no installed lineage", async () => {
    mocks.lineage.mockResolvedValue(null);
    await assertInstalledSystemConnections(actor, { businessId, systemId });
    expect(mocks.assert).not.toHaveBeenCalled();
  });
  it("refuses unreadable lineage instead of assuming no installed App", async () => {
    mocks.lineage.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(assertInstalledSystemConnections(actor, { businessId, systemId })).rejects.toThrow("storage unavailable");
  });
  it("checks before moving the current pointer or changing Draft to Live", async () => {
    const store = createMemorySystemStore({ access: () => "owner" });
    const system = await store.createSystem(actor, businessId, { name: "Requests", kind: "other" }, crypto.randomUUID());
    const ref = { businessId, systemId: system.id };
    const content = createInMemoryRevisionContent();
    const implementation = await content.put(businessId, { title: "Requests" });
    const { revision } = await store.recordRevision(actor, ref, null, { implementation, summary: "Draft" }, crypto.randomUUID(), { activate: false });
    const assertConnections = vi.fn(async () => { throw new Error("Reconnect email in Connections."); });
    const live = createSystemStoreLiveSystems({ store, content, actor, assertConnections });
    await expect(live.activate(ref, revision.id, null)).rejects.toThrow("Reconnect email");
    expect(assertConnections).toHaveBeenCalledWith(actor, ref);
    expect((await store.readSystem(actor, ref)).system).toMatchObject({ lifecycle: "draft", currentRevision: null });
  });
});
