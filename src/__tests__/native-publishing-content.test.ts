import { beforeEach, describe, expect, it, vi } from "vitest";
import { workspacePublishingScope } from "@/platform/infra/publishing-scope";
const m = vi.hoisted(() => ({ rpc: vi.fn(), add: vi.fn(), entry: vi.fn(), events: vi.fn(), enabled: vi.fn(), authorize: vi.fn(), workspaces: vi.fn(), systems: vi.fn(), permission: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: m.rpc }) }));
vi.mock("@/platform/infra/tenant-publishing", () => ({ tenantPublishingPorts: async () => ({ addEvent: m.add, getEntry: m.entry, getEventsRaw: m.events }) }));
vi.mock("@/products/publishing/release", () => ({ publishingEnabledForWorkspace: m.enabled }));
vi.mock("@/platform/release-flags/store", () => ({ workspaceReleaseFlagEnabled: m.enabled }));
vi.mock("@/products/publishing/authority", () => ({ authorizePublishingEvent: m.authorize }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: m.workspaces }));
vi.mock("@/platform/systems/from-existing", () => ({ listBusinessSystems: m.systems }));
vi.mock("@/platform/systems/supabase-store", () => ({ createSupabaseSystemStore: () => ({}) }));
vi.mock("@/platform/workspace-exit/repository", () => ({ readWorkspaceExitCompleted: async () => false }));
vi.mock("@/platform/infra/auth", () => ({ hasTenantPermission: m.permission }));
vi.mock("@/products/publishing/server", () => ({ readPublishingSnapshot: async () => ({}), readPublishingExtras: async () => ({}) }));
vi.mock("@/products/publishing/projection", () => ({ addPublishingSystems: (base: unknown) => ({ listing: base }) }));
import { contentTarget } from "@/products/publishing/content-server";
import { executePublishingEvent, prepareContentDraft, prepareContentRestore, readContentWorkspace } from "@/products/publishing/content-service";
const workspaceId = "af100000-0000-4000-8000-000000000010";
const systemId = "af100000-0000-4000-8000-000000000020";
const actor = { userId: "af100000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
beforeEach(() => {
  vi.resetAllMocks();
  m.enabled.mockResolvedValue(true); m.authorize.mockResolvedValue({ allowed: true, actor }); m.events.mockResolvedValue([]);
  m.workspaces.mockResolvedValue([{ id: workspaceId, kind: "customer", access: "member", role: "owner" }]);
  m.systems.mockResolvedValue({ systems: [{ system: { id: systemId, kind: "website", lifecycle: "draft" }, references: { tenantId: null } }] });
  m.add.mockImplementation(async event => ({ ...event, id: "evt-native", createdAt: "now" }));
  m.rpc.mockImplementation(async (name: string) => ({ data: name === "publish_native_workspace_collection" ? { receiptId: "af100000-0000-4000-8000-000000000099", verified: true } : [], error: null }));
});
describe("native content through the existing approval service", () => {
  it("resolves an owned native System without tenant membership and publishes only after approval", async () => {
    const target = await contentTarget(actor, workspaceId, systemId, true);
    expect(target).toMatchObject({ tenantId: workspacePublishingScope(workspaceId), canCompose: true, canApprove: true });
    expect(m.permission).not.toHaveBeenCalled();
    const event = await prepareContentDraft(target, { kind: "collection", type: "blog", data: { title: "Native article" } });
    expect(m.entry).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalledWith("publish_native_workspace_collection", expect.anything());
    expect(event).toMatchObject({ status: "pending", metadata: { systemId, workspaceId, reviewAudience: "owner" } });
    expect(await executePublishingEvent({ tenantId: target.tenantId, event, actorId: actor.userId, attemptId: "approved" })).toMatchObject({ accepted: true, verified: true });
    expect(m.rpc).toHaveBeenCalledWith("publish_native_workspace_collection", { p_input: expect.objectContaining({ workspaceId, systemId, tenantId: target.tenantId, actor: actor.userId }) });
    const read = await readContentWorkspace(target);
    expect(read.entries).toHaveLength(3);
  });
  it("requires direct member scope and restricts approval to owners", async () => {
    m.workspaces.mockResolvedValue([{ id: workspaceId, kind: "agency", access: "assigned", role: "owner" }]);
    await expect(contentTarget(actor, workspaceId, systemId, true)).rejects.toThrow();
    m.workspaces.mockResolvedValue([{ id: workspaceId, kind: "customer", access: "member", role: "admin" }]);
    expect(await contentTarget(actor, workspaceId, systemId, true)).toMatchObject({ canCompose: true, canApprove: false });
    m.systems.mockResolvedValue({ systems: [] });
    await expect(contentTarget(actor, workspaceId, systemId, true)).rejects.toThrow();
  });
  it("native restore creates another exact draft and never writes outside approval", async () => {
    const target = await contentTarget(actor, workspaceId, systemId);
    const receiptId = "af100000-0000-4000-8000-000000000099";
    m.rpc.mockImplementation(async (name: string) => ({ data: name === "read_native_workspace_collection_receipts" ? [{ id: receiptId, request: { type: "blog", slug: "article", data: { title: "Published" } }, beforeState: { status: "published", data: { title: "Original" } } }] : [{ type: "blog", slug: "article", status: "published", data: { title: "Published" } }], error: null }));
    const event = await prepareContentRestore(target, receiptId);
    expect(event.metadata?.publishing).toMatchObject({ slug: "article", data: { title: "Original" }, before: { status: "published", data: { title: "Published" } } });
    expect(m.rpc).not.toHaveBeenCalledWith("publish_native_workspace_collection", expect.anything());
  });
  it("flags off never read or enqueue a native proposal", async () => {
    m.enabled.mockResolvedValue(false);
    await expect(prepareContentDraft({ actor, workspaceId, systemId, tenantId: workspacePublishingScope(workspaceId), kind: "website" }, { kind: "collection", type: "blog", data: { title: "Off" } })).rejects.toThrow("not enabled");
    expect(m.rpc).not.toHaveBeenCalled(); expect(m.add).not.toHaveBeenCalled();
  });
});
