import { beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceExitHandoffCompletionSchema } from "@/platform/workspace-exit/contracts";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), actor: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/workspaces/http", async original => ({ ...await original<typeof import("@/platform/workspaces/http")>(), workspaceHttpActor: mocks.actor }));
import { recordWorkspaceExitHandoff } from "@/platform/workspace-exit/repository";
const actor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "operator@example.test" };
const command = { workspaceId: "22222222-2222-4222-8222-222222222222", tenantStableId: "33333333-3333-4333-8333-333333333333", kind: "files", evidence: "Repository and assets transferred with owner authorization." };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("STRELVA_EXIT_HANDOFF", "1"); vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); });
describe("exit completion evidence", () => {
  it("requires a completed business archive reference for export", () => {
    expect(workspaceExitHandoffCompletionSchema.safeParse({ ...command, kind: "export" }).success).toBe(false);
    expect(workspaceExitHandoffCompletionSchema.safeParse({ ...command, evidence: " " }).success).toBe(false);
  });
  it("keeps completion unavailable and does not write while the flag is off", async () => {
    vi.stubEnv("STRELVA_EXIT_HANDOFF", "0");
    await expect(recordWorkspaceExitHandoff(actor, command)).rejects.toThrow("unavailable"); expect(mocks.rpc).not.toHaveBeenCalled();
    const route = await import("@/app/api/workspace-exit/handoff/route");
    expect((await route.POST(new Request("https://app.test/api/workspace-exit/handoff", { method: "POST" }))).status).toBe(503); expect(mocks.actor).not.toHaveBeenCalled();
  });
  it("records evidence under verified operator identity and returns the plan", async () => {
    const plan = { businessRecordRetained: true, dataDeleted: false, sites: [], systems: [] };
    mocks.rpc.mockResolvedValue({ data: plan, error: null });
    expect(await recordWorkspaceExitHandoff(actor, command)).toEqual(plan);
    expect(mocks.rpc).toHaveBeenCalledWith("record_workspace_exit_handoff", expect.objectContaining({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_evidence: command.evidence, p_export_build_id: null }));
  });
  it("fails closed for owner/member or other-business completion attempts", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "workspace_exit_denied" } });
    await expect(recordWorkspaceExitHandoff(actor, command)).rejects.toMatchObject({ name: "WorkspaceAccessError" });
  });
});
