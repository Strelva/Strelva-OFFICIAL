import { describe, expect, it, vi } from "vitest";
vi.mock("ai", () => ({ tool: (definition: unknown) => definition }));
import { buildAskTools, type AskToolsContext } from "@/platform/ask/tools";
import { AskNativePreparationIncompleteError } from "@/platform/ask/native-systems";
import { WorkspaceMakeSystemsError } from "@/platform/workspaces/types";

const workspaceId = "11111111-1111-4111-8111-111111111111", systemId = "22222222-2222-4222-8222-222222222222", workId = "33333333-3333-4333-8333-333333333333";
const input = { workId, designRevision: 3, versionId: null, rowRevision: null, change: { kind: "title", value: "Requests" } };
function harness() {
  const nativeSystems = { read: vi.fn(async () => ({ workspaceId, systemId, workId, designRevision: 3, versionId: null, rowRevision: null })),
    prepare: vi.fn(async () => ({ workId, versionId: null, rowRevision: null, decisionSyncPending: false,
      routing: { route: "owner_decides" as const, itemRef: workId, decideAt: `/workspace?workspaceId=${workspaceId}` } })) };
  const ctx: AskToolsContext = { workspaceId, systemId, tenantId: null, actor: { userId: workId, verifiedEmail: "owner@example.test" }, role: "owner",
    origin: "owner_interpreted", askedOnBehalf: null, lastUserText: "Rename our app to Requests", turnId: workId, tenantTools: null,
    authority: { read: vi.fn<AskToolsContext["authority"]["read"]>(async () => ({ role: "owner", exited: false, site: null, googleWriteGranted: false, inquiriesEnabled: false })) },
    nativeSystems, needsYou: { submit: vi.fn() }, requests: { file: vi.fn<AskToolsContext["requests"]["file"]>(async () => ({ id: workId, status: "requested" })), list: vi.fn() },
    possibilities: { open: vi.fn(), list: vi.fn() }, onReceipt: vi.fn() };
  const tools = buildAskTools(ctx);
  async function execute(name: "read_system" | "draft_system_change", value: unknown) {
    return (tools[name] as unknown as { execute(input: unknown): Promise<Record<string, unknown>> }).execute(value);
  }
  return { ctx, nativeSystems, execute };
}
describe("Ask native tools preserve read and fresh authority", () => {
  it("requires this turn's exact native read before preparing, and never uses tenant tools", async () => {
    const h = harness();
    expect(await h.execute("draft_system_change", input)).toMatchObject({ reason: "current_read_required" });
    expect(h.nativeSystems.prepare).not.toHaveBeenCalled();
    await h.execute("read_system", { view: "native_application" });
    expect(await h.execute("draft_system_change", input)).toMatchObject({ success: true, needsYou: { route: "owner_decides" } });
    expect(h.nativeSystems.prepare).toHaveBeenCalledExactlyOnceWith(h.ctx.actor, { workspaceId, systemId, ...input });
    expect(await h.execute("draft_system_change", input)).toMatchObject({ reason: "current_read_required" });
  });
  it.each(["revoked", "exited", "unknown"])("rereads %s authority before the native writer", async state => {
    const h = harness(); await h.execute("read_system", { view: "native_application" });
    h.ctx.authority.read = async () => ({ role: state === "revoked" ? null : "owner", exited: state === "unknown" ? "unknown" : state === "exited", site: null, googleWriteGranted: false, inquiriesEnabled: false });
    expect(await h.execute("draft_system_change", input)).toMatchObject({ success: false, blocked: true });
    expect(h.nativeSystems.prepare).not.toHaveBeenCalled();
  });
  it("freezes another write after a partial or lost preparation until a current read succeeds", async () => {
    const h = harness(); await h.execute("read_system", { view: "native_application" });
    h.nativeSystems.prepare.mockRejectedValueOnce(new AskNativePreparationIncompleteError(workId, null, null));
    expect(await h.execute("draft_system_change", input)).toMatchObject({ currentReadRequired: true, success: false });
    expect(await h.execute("draft_system_change", input)).toMatchObject({ reason: "current_read_required" });
    h.nativeSystems.read.mockRejectedValueOnce(new Error("unavailable"));
    await expect(h.execute("read_system", { view: "native_application" })).rejects.toThrow();
    expect(await h.execute("draft_system_change", input)).toMatchObject({ reason: "current_read_required" });
    await h.execute("read_system", { view: "native_application" });
    await h.execute("draft_system_change", input);
    expect(h.nativeSystems.prepare).toHaveBeenCalledTimes(2);
  });
  it("refuses a native read receipt from another System", async () => {
    const h = harness(); h.nativeSystems.read.mockResolvedValueOnce({ workspaceId, systemId: workId, workId, designRevision: 3, versionId: null, rowRevision: null });
    await expect(h.execute("read_system", { view: "native_application" })).rejects.toThrow("another System");
    expect(await h.execute("draft_system_change", input)).toMatchObject({ reason: "current_read_required" });
  });
  it("preserves original words and Asked status when existing maker authority requires a Request", async () => {
    const h = harness(); await h.execute("read_system", { view: "native_application" });
    h.nativeSystems.prepare.mockRejectedValueOnce(new WorkspaceMakeSystemsError());
    expect(await h.execute("draft_system_change", input)).toMatchObject({ requestId: workId, success: true });
    expect(h.ctx.requests.file).toHaveBeenCalledWith(h.ctx.actor, expect.objectContaining({ workspaceId, systemId, words: h.ctx.lastUserText }));
    expect(h.ctx.onReceipt).toHaveBeenCalledWith(expect.objectContaining({ kind: "request", status: "filed" }));
  });
});
