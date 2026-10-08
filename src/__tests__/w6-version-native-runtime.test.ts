import { describe, expect, it, vi } from "vitest";
import { createInMemoryConnectionOwnership, createInMemoryVersionStore, createSystemVersions, declareApplicationPackage } from "@/platform/system-versions";
import { prepareVersionRelease } from "@/platform/system-versions/preparation";
import { readVersionRuntime } from "@/platform/system-versions/native-runtime";
import type { VersionsDb } from "@/platform/system-versions/supabase-store";

const actor = { userId: crypto.randomUUID(), verifiedEmail: "native-owner@example.test" };
async function fixture() {
  const businessId = crypto.randomUUID(), systemId = crypto.randomUUID();
  const versionActor = { userId: actor.userId, memberships: [{ businessId, role: "owner" as const }] };
  const versions = createSystemVersions({ store: createInMemoryVersionStore(), connections: createInMemoryConnectionOwnership() });
  const revision = await versions.publishSourceRevision(versionActor, { source: { businessId, systemId }, definition: declareApplicationPackage({ kind: "internal_app", title: "Intake", fields: [{ id: "problem", label: "Problem", type: "text", required: true }], components: [{ kind: "form", fields: ["problem"] }] }), summary: "First" });
  const lineage = await versions.createVersion(versionActor, { source: revision.source, version: { businessId, systemId: crypto.randomUUID() }, context: { kind: "location", label: "Local" } });
  return { lineage, versions, versionActor };
}
describe("Version runtime preparation truth", () => {
  it("rejects unsupported runtime before any policy read or owner decision", async () => {
    const { lineage } = await fixture();
    const decisions = { policies: vi.fn(), open: vi.fn() };
    const rpc = vi.fn<VersionsDb["rpc"]>(async () => ({ data: null, error: null }));
    await expect(prepareVersionRelease(actor, lineage, { decisions, db: { rpc } })).rejects.toThrow(/operator-prepared work/);
    expect(rpc).toHaveBeenCalledWith("read_version_native_runtime", expect.objectContaining({ p_workspace_id: lineage.version.businessId, p_version_id: lineage.id }));
    expect(decisions.policies).not.toHaveBeenCalled(); expect(decisions.open).not.toHaveBeenCalled();
  });
  it("rejects malformed, independently published and stale native runtimes", async () => {
    const { lineage } = await fixture();
    for (const data of [{ kind: "website", workId: crypto.randomUUID(), releaseNumber: null, designRevision: 0 }, { kind: "internal_app", workId: crypto.randomUUID(), releaseNumber: 1, designRevision: 0 }]) {
      await expect(readVersionRuntime(actor, lineage, { rpc: async () => ({ data, error: null }) })).rejects.toThrow();
    }
    await expect(readVersionRuntime(actor, lineage, { rpc: async () => ({ data: null, error: { message: "system_version_stale" } }) })).rejects.toThrow(/changed|Reload/i);
  });
  it("fails closed on unreadable policy after a verified runtime, without opening a decision", async () => {
    const { lineage } = await fixture();
    const decisions = { policies: vi.fn(async () => { throw new Error("Policy unavailable"); }), open: vi.fn() };
    const rpc = vi.fn<VersionsDb["rpc"]>(async () => ({ data: { kind: "internal_app", workId: crypto.randomUUID(), releaseNumber: null, designRevision: 0 }, error: null }));
    await expect(prepareVersionRelease(actor, lineage, { decisions, db: { rpc } })).rejects.toThrow("Policy unavailable");
    expect(decisions.open).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("does not invent a release decision when this working definition is already live", async () => {
    const { lineage, versions, versionActor } = await fixture();
    const live = await versions.release(versionActor, lineage.id, { expectedRowRevision: 1 });
    const decisions = { policies: vi.fn(), open: vi.fn() }, rpc = vi.fn<VersionsDb["rpc"]>();
    expect(await prepareVersionRelease(actor, live, { decisions, db: { rpc } })).toBeNull();
    expect(rpc).not.toHaveBeenCalled(); expect(decisions.open).not.toHaveBeenCalled();
  });
});
