import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VersionsDb } from "@/platform/system-versions/supabase-store";
const deps = vi.hoisted(() => ({ kind: "internal_app", scope: vi.fn() }));
vi.mock("@/experience/workspace/agency/authoring-server", () => ({ requireAgencyAuthoring: deps.scope }));
vi.mock("@/platform/systems", async original => ({ ...(await original<typeof import("@/platform/systems")>()), createSupabaseSystemStore: () => ({ readSystem: async () => ({ system: { kind: deps.kind } }) }) }));
import { effectivePackageBehavior } from "@/platform/system-versions/declaration";
import { createBusinessVersion } from "@/experience/workspace/agency/version-server";
const actor = { userId: crypto.randomUUID(), verifiedEmail: "native-maker@example.test" };
const agencyWorkspaceId = crypto.randomUUID(), workspaceId = crypto.randomUUID(), canonicalSystemId = crypto.randomUUID();
const source = { businessId: agencyWorkspaceId, systemId: crypto.randomUUID(), revisionId: crypto.randomUUID(), number: 1 };
const input = { agencyWorkspaceId, workspaceId, source, context: { kind: "agency_client" as const, label: "Local client" }, name: "Client intake", commandId: crypto.randomUUID() };
function database(definition: Record<string, unknown> = { kind: "internal_app", title: "Intake", fields: [{ id: "problem", label: "Problem", type: "text", required: true }], components: [{ kind: "form", fields: ["problem"] }] }) {
  const rpc = vi.fn<VersionsDb["rpc"]>(async (name, args) => {
    if (name === "require_system_package_install_scope") return { data: true, error: null };
    if (name === "read_version_actor") return { data: { userId: actor.userId, memberships: [{ businessId: agencyWorkspaceId, role: "owner" }, { businessId: workspaceId, role: "admin" }] }, error: null };
    if (name === "read_system_version_source_revisions") return { data: [{ source, definition, summary: "First", ...(definition.kind === "internal_app" && !("records" in definition) ? { declaration: effectivePackageBehavior(definition), qualification: { revisionId: source.revisionId, status: "qualified", evidence: ["shareable_definition","declaration_match","rehearsal","prior_revision_compare"].map(check => ({revisionId:source.revisionId,check,status:"passed",note:"Fictional exact native receipt"})),humanReview:{state:"approved",reviewerId:actor.userId,reviewedAt:new Date().toISOString(),note:"Fixture review"} } } : {}), requires: { bindingKinds: [] }, publishedBy: actor.userId, publishedAt: new Date().toISOString() }], error: null };
    if (name === "read_system_version_source") return { data: { source: { businessId: agencyWorkspaceId, systemId: source.systemId }, hidden: false, sharedWith: [], createdAt: new Date().toISOString() }, error: null };
    if (name === "read_system_version_for_system") return { data: null, error: null };
    if (name === "create_version_system_command") return { data: { ...(args.p_lineage as Record<string, unknown>), version: { businessId: workspaceId, systemId: canonicalSystemId } }, error: null };
    throw new Error(`Unexpected RPC ${name}`);
  });
  return { rpc };
}
beforeEach(() => { deps.kind = "internal_app"; deps.scope.mockReset().mockResolvedValue(undefined); });
describe("public Version creation uses native artifacts", () => {
  it("sends an empty native application draft through one atomic command with no earlier source-share mutation", async () => {
    const db = database();
    expect(await createBusinessVersion(actor, input, db)).toMatchObject({ outcome: "created", systemId: canonicalSystemId });
    const args = db.rpc.mock.calls.find(([name]) => name === "create_version_system_command")![1];
    expect(args).toMatchObject({ p_command_id: input.commandId, p_native_payload: { status: "draft", revision: 0, records: [], history: [], rehearsal: null, createdBy: actor.userId, spec: { maintenanceOwner: actor.userId } } });
    expect(db.rpc.mock.calls.filter(([name]) => name === "create_version_system_command")).toHaveLength(1);
    expect(db.rpc.mock.calls.some(([name]) => name === "put_system_version_source" || name === "create_system_version")).toBe(false);
  });
  it("refuses unsupported packaged shapes before any create or share write", async () => {
    for (const kind of ["website", "proposal", "booking"]) {
      deps.kind = kind; const db = database({ kind, title: "Other source" });
      await expect(createBusinessVersion(actor, input, db)).rejects.toThrow(/cannot create a running Version automatically/);
      expect(db.rpc.mock.calls.some(([name]) => name.startsWith("create_") || name.startsWith("put_"))).toBe(false);
    }
  });
  it("refuses source definitions with records or foreign maintenance authority without mutation", async () => {
    const db = database({ kind: "internal_app", title: "Intake", maintenanceOwner: crypto.randomUUID(), fields: [], components: [], records: [{ private: "source record" }] });
    await expect(createBusinessVersion(actor, input, db)).rejects.toThrow();
    expect(db.rpc.mock.calls.some(([name]) => name.startsWith("create_") || name.startsWith("put_"))).toBe(false);
  });
  it("propagates native command failure without publishing the source share separately", async () => {
    const db = database(); const normal = db.rpc.getMockImplementation()!;
    db.rpc.mockImplementation(async (name, args) => name === "create_version_system_command" ? { data: null, error: { message: "native write failed" } } : normal(name, args));
    await expect(createBusinessVersion(actor, input, db)).rejects.toThrow(/could not be created/);
    expect(db.rpc.mock.calls.some(([name]) => name === "put_system_version_source")).toBe(false);
  });
});
