import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryConnectionOwnership, createInMemoryVersionStore, createSystemVersions, VersionStaleError, type VersionActor, type VersionStore } from "@/platform/system-versions";
const deps = vi.hoisted(() => ({ store: null as VersionStore | null, actor: null as VersionActor | null, list: vi.fn(), create: vi.fn() }));
vi.mock("@/platform/systems", () => ({ createSupabaseSystemStore: () => ({ createSystem: deps.create }), listBusinessSystems: deps.list }));
vi.mock("@/products/work-plans", () => ({ createWorkPlan: vi.fn(), executeWorkPlanOutput: vi.fn(), presentWorkPlan: vi.fn() }));
vi.mock("@/platform/system-versions/supabase-store", async () => {
  const actual = await vi.importActual<typeof import("@/platform/system-versions/supabase-store")>("@/platform/system-versions/supabase-store");
  return { ...actual, createSupabaseVersionStore: () => deps.store, createSupabaseConnectionOwnership: () => createInMemoryConnectionOwnership(), readVersionActor: async () => deps.actor };
});
import { packageAgencySystem } from "@/experience/workspace/agency/authoring-server";
const workspaceId = crypto.randomUUID(), systemId = crypto.randomUUID();
const actor = { userId: crypto.randomUUID(), verifiedEmail: "authoring-operator@example.test" };
const versionActor: VersionActor = { ...actor, memberships: [{ businessId: workspaceId, role: "owner" }] };
beforeEach(() => {
  vi.clearAllMocks(); deps.store = createInMemoryVersionStore(); deps.actor = versionActor;
  deps.list.mockResolvedValue({ systems: [{ system: { id: systemId, name: "Reusable inquiry" }, references: {}, provenance: "persisted" }] });
});
async function fixture() {
  const first = await createSystemVersions({ store: deps.store!, connections: createInMemoryConnectionOwnership() }).publishSourceRevision(versionActor, {
    source: { businessId: workspaceId, systemId }, definition: { title: "Intake" }, requires: { bindingKinds: ["booking_calendar"] }, summary: "First",
  });
  const input = { workspaceId, systemId, commandId: crypto.randomUUID(), fingerprint: `source:${first.source.revisionId}`, expectedRevision: 1, summary: "Packaged improvement" };
  return { first, input };
}
describe("agency Package command receipts", () => {
  it("recovers accepted publication before checking the now-changed source fingerprint", async () => {
    const { input } = await fixture();
    let accepted: unknown = null;
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "require_agency_authoring_scope") return { data: true, error: null };
      if (name === "read_agency_package_command") return { data: accepted, error: null };
      if (name === "publish_agency_package") {
        accepted = args.p_revision;
        await deps.store!.insertRevision(versionActor, args.p_revision as Parameters<VersionStore["insertRevision"]>[1]);
        throw new Error("reply lost after commit");
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });
    await expect(packageAgencySystem(actor, input, { rpc })).rejects.toThrow("reply lost after commit");
    const beforeRetry = deps.list.mock.calls.length;
    const result = await packageAgencySystem(actor, input, { rpc });
    expect(result).toMatchObject({ workspaceId, systemId, revision: 2 });
    expect(deps.list.mock.calls).toHaveLength(beforeRetry);
    expect(rpc.mock.calls.filter(([name]) => name === "publish_agency_package")).toHaveLength(1);
    expect(rpc).toHaveBeenLastCalledWith("read_agency_package_command", expect.objectContaining({ p_workspace_id: workspaceId,
      p_system_id: systemId, p_command_id: input.commandId, p_fingerprint: input.fingerprint, p_expected_revision: 1, p_summary: input.summary }));
    expect(await deps.store!.listRevisions(versionActor, { businessId: workspaceId, systemId })).toHaveLength(2);
    expect(rpc.mock.calls.find(([name]) => name === "publish_agency_package")?.[1].p_revision).toMatchObject({ requires: { bindingKinds: ["booking_calendar"] }, packageFingerprint: input.fingerprint });
  });
  it("fails closed when the command lookup is unavailable or rejects altered reuse", async () => {
    const { input } = await fixture();
    const rpc = vi.fn(async (name: string) => name === "require_agency_authoring_scope" ? { data: true, error: null }
      : { data: null, error: { message: "system_version_stale" } });
    await expect(packageAgencySystem(actor, { ...input, summary: "Changed command" }, { rpc })).rejects.toBeInstanceOf(VersionStaleError);
    expect(deps.list).not.toHaveBeenCalled();
    rpc.mockImplementation(async (name: string) => name === "require_agency_authoring_scope" ? { data: true, error: null }
      : { data: null, error: { message: "database unavailable" } });
    await expect(packageAgencySystem(actor, input, { rpc })).rejects.toThrow("Retry the same request");
    expect(deps.list).not.toHaveBeenCalled();
  });
  it("rejects a malformed or foreign accepted receipt without consulting mutable state", async () => {
    const { input } = await fixture();
    const rpc = vi.fn(async (name: string) => name === "require_agency_authoring_scope" ? { data: true, error: null }
      : { data: { source: { businessId: crypto.randomUUID(), systemId, revisionId: crypto.randomUUID(), number: 2 } }, error: null });
    await expect(packageAgencySystem(actor, input, { rpc })).rejects.toThrow("receipt could not be confirmed");
    expect(deps.list).not.toHaveBeenCalled();
  });
});
