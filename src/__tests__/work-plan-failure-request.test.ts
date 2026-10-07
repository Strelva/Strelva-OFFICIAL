import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({ mayBeOn: vi.fn(), released: vi.fn(), rpc: vi.fn(), db: vi.fn(), model: vi.fn() }));
vi.mock("@/platform/systems-release", () => ({ systemsReleaseMayBeOn: deps.mayBeOn, systemsReleasedFor: deps.released }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: deps.db }));
vi.mock("@/platform/infra/model-calls", () => ({ generateModelText: deps.model }));
import { fileFailedSystemPlanRequest } from "@/products/work-plans/failure-request";
import { defaultGenerate } from "@/products/work-plans/generation";
import { WorkPlanUnavailableError, WorkPlanInvalidOutputError, WorkPlanFundingRequiredError, WorkPlanGenerationReplayError } from "@/products/work-plans/errors";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
const actor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "agency@example.test" };
const input = { workspaceId: "22222222-2222-4222-8222-222222222222", userGoal: "Track bookkeeping clients", evidence: [] };
const requestId = "33333333-3333-4333-8333-333333333333";
beforeEach(() => {
  vi.resetAllMocks();
  deps.mayBeOn.mockReturnValue(true); deps.released.mockResolvedValue(true);
  deps.db.mockReturnValue({ rpc: deps.rpc }); deps.rpc.mockResolvedValue({ data: requestId, error: null });
  deps.model.mockResolvedValue({ result: { output: {} } });
});
afterEach(() => vi.unstubAllEnvs());
describe("failed Systems planning", () => {
  it.each([new WorkPlanUnavailableError(), new WorkPlanInvalidOutputError()])("files a pending Request for a failed draft", async error => {
    expect(await fileFailedSystemPlanRequest(error, actor, input)).toBe(requestId);
    expect(deps.rpc).toHaveBeenCalledWith("file_failed_system_plan_request", expect.objectContaining({ p_workspace_id: input.workspaceId, p_goal: input.userGoal, p_user_id: actor.userId }));
  });
  it("uses a stable retry identity and isolates actors and goals", async () => {
    const error = new WorkPlanUnavailableError();
    await fileFailedSystemPlanRequest(error, actor, input); await fileFailedSystemPlanRequest(error, actor, input);
    expect(deps.rpc.mock.calls[0]![1]).toEqual(deps.rpc.mock.calls[1]![1]);
    await fileFailedSystemPlanRequest(error, { ...actor, userId: requestId }, input);
    await fileFailedSystemPlanRequest(error, actor, { ...input, userGoal: "A different intake" });
    expect(new Set(deps.rpc.mock.calls.map(call => call[1].p_digest)).size).toBe(3);
  });
  it("does no reads or writes with the flag off, including workspace row-off", async () => {
    deps.mayBeOn.mockReturnValue(false);
    expect(await fileFailedSystemPlanRequest(new WorkPlanUnavailableError(), actor, input)).toBeNull();
    expect(deps.released).not.toHaveBeenCalled(); expect(deps.db).not.toHaveBeenCalled();
    deps.mayBeOn.mockReturnValue(true); deps.released.mockResolvedValue(false);
    expect(await fileFailedSystemPlanRequest(new WorkPlanUnavailableError(), actor, input)).toBeNull();
    expect(deps.db).not.toHaveBeenCalled();
  });
  it.each([new WorkspaceAccessError(), new WorkPlanFundingRequiredError(), new WorkPlanGenerationReplayError()])("does not file for authority, budget or replay refusals", async error => {
    expect(await fileFailedSystemPlanRequest(error, actor, input)).toBeNull(); expect(deps.released).not.toHaveBeenCalled(); expect(deps.rpc).not.toHaveBeenCalled();
  });
  it.each([{ data: null, error: null }, { data: requestId, error: { message: "revoked" } }])("never claims filing succeeded without a confirmed Request", async result => {
    deps.rpc.mockResolvedValue(result);
    await expect(fileFailedSystemPlanRequest(new WorkPlanUnavailableError(), actor, input)).rejects.toThrow("could not be saved");
  });
});
describe("planning linked-field release", () => {
  it.each([undefined, false, true])("adds linked field guidance only with resolved release %s", async linkedFieldsEnabled => {
    vi.stubEnv("STRELVA_PLANNING_ENABLED", "1"); vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "fictional-test-key");
    await defaultGenerate({ userGoal: input.userGoal, evidence: [], allowedOperations: [], linkedFieldsEnabled });
    const prompt = deps.model.mock.calls[0]![1].system;
    expect(prompt.includes("assigned_person")).toBe(linkedFieldsEnabled === true);
    expect(prompt).toContain("supported text, number, and boolean types");
  });
});
