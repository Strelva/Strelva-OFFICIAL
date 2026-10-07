import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ released: vi.fn(), maker: vi.fn(), member: vi.fn(), capacity: vi.fn(), save: vi.fn(), readPlan: vi.fn(), workspaces: vi.fn(), delegations: vi.fn() }));
vi.mock("@/platform/systems-release", () => ({ systemsReleasedFor: mocks.released, systemsReleaseEnabled: () => false }));
vi.mock("@/platform/workspaces/repository", () => ({ assertCanMakeSystems: mocks.maker }));
vi.mock("@/platform/workspaces", async () => ({ ...await vi.importActual<Record<string, unknown>>("@/platform/workspaces"), assertWorkspaceMember: mocks.member, assertCanSaveWork: mocks.capacity, listWorkspaces: mocks.workspaces, listAgencyDelegations: mocks.delegations }));
vi.mock("@/products/work-plans/repository", () => ({ saveMakerWorkPlan: mocks.save, readWorkPlan: mocks.readPlan }));

import { createWorkPlan, executeWorkPlanOutput } from "@/products/work-plans/server";
import { workPlanFundingWorkspace } from "@/products/work-plans/funding";
import { WorkspaceAccessError, WorkspaceMakeSystemsError } from "@/platform/workspaces/types";

const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "agency@example.com" };
const workspaceId = "11111111-1111-4111-8111-111111111111";
const agencyId = "22222222-2222-4222-8222-222222222222";
const workId = "33333333-3333-4333-8333-333333333333";
const nativeId = "44444444-4444-4444-8444-444444444444";
const draft = { kind: "application", title: "Bookkeeping intake", fields: [{ id: "client", label: "Client", type: "contact", required: true }, { id: "handler", label: "Assigned person", type: "assigned_person", required: false }], components: [{ kind: "form", fields: ["client", "handler"] }, { kind: "list", fields: ["client", "handler"] }] };
const generated = { status: "ready", summary: "Track clients and the staff handling them.", proposedOutputs: [{ id: "intake", title: draft.title, description: "Private intake and client list", outcome: "capability", nativeOperationIds: ["create_application"], draft }], steps: [], neededInputs: [], supportedNativeOperationIds: ["create_application"], requiredDecisions: [] };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_PLANNING_ENABLED", "1");
  mocks.released.mockResolvedValue(true);
  mocks.maker.mockResolvedValue("agency");
  mocks.workspaces.mockResolvedValue([{ id: agencyId, kind: "agency", access: "member" }]);
  mocks.delegations.mockResolvedValue([{ customerWorkspaceId: workspaceId, status: "active" }]);
  mocks.save.mockImplementation(async (_actor, id, work) => ({ id: workId, workspaceId: id, ...work }));
});
afterEach(() => vi.unstubAllEnvs());

describe("Systems work-plan Make path", () => {
  it("creates a delegated agency plan with contact/person fields without direct client membership", async () => {
    const generate = vi.fn().mockResolvedValue(generated);
    const result = await createWorkPlan({ actor, workspaceId, userGoal: "Track each bookkeeping client and who handles them", generate });
    expect(result.plan.proposedOutputs[0]?.draft).toEqual(draft);
    expect(mocks.maker).toHaveBeenCalledWith(actor, workspaceId);
    expect(mocks.capacity).not.toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalledOnce();
  });

  it("denies owners before a model call or plan storage", async () => {
    mocks.maker.mockRejectedValue(new WorkspaceMakeSystemsError());
    const generate = vi.fn();
    await expect(createWorkPlan({ actor, workspaceId, userGoal: "Make an intake", generate })).rejects.toBeInstanceOf(WorkspaceMakeSystemsError);
    expect(generate).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("executes a linked-field Draft using the workspace flag, not the global env-only flag", async () => {
    const plan = await createWorkPlan({ actor, workspaceId, userGoal: "Make an intake", generate: async () => generated });
    mocks.readPlan.mockResolvedValue(plan);
    const persist = vi.fn(async (input) => ({ executionId: "receipt", planWorkId: workId, outputId: "intake", planRevision: 1, status: "completed" as const, replayed: false, nativeWorkId: nativeId, nativeProductId: "applications", nativeResourceKind: "application", createdAt: "2026-10-06T12:00:00Z", receipt: { version: 1, kind: "work_plan_output", planWorkId: workId, outputId: "intake", planRevision: 1, operationId: "create_application", actorId: actor.userId, nativeWorkId: nativeId, completedAt: "2026-10-06T12:00:00Z", capabilityVersion: input.capabilityVersion } }));
    const result = await executeWorkPlanOutput({ actor, workspaceId, planWorkId: workId, outputId: "intake", expectedPlanRevision: 1, read: async () => null, persist });
    expect(result.nativeWorkId).toBe(nativeId);
    expect(mocks.member).not.toHaveBeenCalled();
    expect(persist.mock.calls[0]?.[0].nativePayload).toMatchObject({ status: "draft", records: [], spec: { fields: draft.fields, maintenanceOwner: actor.userId } });
  });

  it("revoked delegation cannot execute an old plan", async () => {
    mocks.maker.mockRejectedValue(new WorkspaceAccessError());
    const persist = vi.fn();
    await expect(executeWorkPlanOutput({ actor, workspaceId, planWorkId: workId, outputId: "intake", expectedPlanRevision: 1, persist })).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(mocks.readPlan).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it("funds delegated work from an active agency's own workspace", async () => {
    expect(await workPlanFundingWorkspace(actor, workspaceId)).toBe(agencyId);
    expect(mocks.delegations).toHaveBeenCalledWith(actor, agencyId);
  });

  it("does not borrow agency funding after delegation is revoked or for another client", async () => {
    mocks.delegations.mockResolvedValue([{ customerWorkspaceId: "other-client", status: "active" }, { customerWorkspaceId: workspaceId, status: "revoked" }]);
    await expect(workPlanFundingWorkspace(actor, workspaceId)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("keeps flags-off planning on its existing workspace budget without new authority reads", async () => {
    mocks.released.mockResolvedValue(false);
    expect(await workPlanFundingWorkspace(actor, workspaceId)).toBe(workspaceId);
    expect(mocks.maker).not.toHaveBeenCalled();
    expect(mocks.workspaces).not.toHaveBeenCalled();
    expect(mocks.delegations).not.toHaveBeenCalled();
  });
});
