import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertCanSaveWork: vi.fn(),
  getWork: vi.fn(),
  saveWork: vi.fn(),
}));

vi.mock("@/platform/workspaces", () => ({
  assertCanSaveWork: mocks.assertCanSaveWork,
  getWork: mocks.getWork,
  saveWork: mocks.saveWork,
}));

import { createWorkPlan, WorkPlanUnavailableError, WorkPlanUnsupportedOperationError } from "@/products/work-plans";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

const actor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "owner@example.com" };
const workspaceId = "22222222-2222-4222-8222-222222222222";

const input = { actor, workspaceId, userGoal: "Turn my customer requests into a tracker" };

const supportedGeneratedPlan = {
  status: "ready" as const,
  summary: "Review a CSV and save a tracker.",
  proposedOutputs: [{
    id: "saved-tracker",
    title: "Saved tracker",
    description: "A filterable workspace tracker.",
    outcome: "capability" as const,
    nativeOperationIds: ["create_tracker"],
  }],
  steps: [{
    id: "review-source",
    title: "Review the source",
    description: "Confirm the rows and mapping before saving.",
    dependsOn: [],
    nativeOperationIds: ["create_tracker"],
  }],
  neededInputs: [{ id: "source-csv", label: "Source CSV", reason: "The tracker is created from this file.", required: true }],
  supportedNativeOperationIds: ["create_tracker"],
  requiredDecisions: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRELVA_PLANNING_ENABLED", "1");
  mocks.assertCanSaveWork.mockResolvedValue(undefined);
});

describe("work plan generation", () => {
  it("rejects a model operation that is absent from the native catalog", async () => {
    const generate = vi.fn().mockResolvedValue({
      status: "ready",
      summary: "A supported plan",
      proposedOutputs: [{
        id: "unsupported-output",
        title: "Unsupported output",
        description: "This cannot be run here.",
        outcome: "capability",
        nativeOperationIds: ["invented_operation"],
      }],
      steps: [{
        id: "step-one",
        title: "Run it",
        description: "Attempt the unsupported operation.",
        dependsOn: [],
        nativeOperationIds: ["invented_operation"],
      }],
      neededInputs: [],
      supportedNativeOperationIds: ["invented_operation"],
      requiredDecisions: [],
    });

    await expect(createWorkPlan({ ...input, generate })).rejects.toBeInstanceOf(WorkPlanUnsupportedOperationError);
    expect(mocks.saveWork).not.toHaveBeenCalled();
  });

  it("denies a non-member before invoking the planning provider", async () => {
    mocks.assertCanSaveWork.mockRejectedValue(new WorkspaceAccessError());
    const generate = vi.fn().mockResolvedValue(supportedGeneratedPlan);

    await expect(createWorkPlan({ ...input, generate })).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(generate).not.toHaveBeenCalled();
    expect(mocks.saveWork).not.toHaveBeenCalled();
  });

  it("reports unavailable when the opt-in path has no configured model", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    vi.stubEnv("AI_FALLBACK_PROVIDER", "");
    vi.stubEnv("AI_FALLBACK_MODEL", "");

    await expect(createWorkPlan(input)).rejects.toBeInstanceOf(WorkPlanUnavailableError);
    expect(mocks.saveWork).not.toHaveBeenCalled();
  });

  it("persists a validated plan with actor and revision metadata", async () => {
    const generate = vi.fn().mockResolvedValue(supportedGeneratedPlan);
    mocks.saveWork.mockImplementation(async (_actor: unknown, _workspaceId: string, saved: Record<string, unknown>) => ({
      id: "33333333-3333-4333-8333-333333333333",
      workspaceId,
      productId: saved.productId,
      resourceKind: saved.resourceKind,
      title: saved.title,
      payload: saved.payload,
      input: saved.input,
      createdBy: actor.userId,
      createdAt: "2026-09-11T00:00:00.000Z",
      updatedAt: "2026-09-11T00:00:00.000Z",
    }));

    const result = await createWorkPlan({
      ...input,
      generate,
      now: () => new Date("2026-09-11T00:00:00.000Z"),
      evidence: [{ label: "User note", value: "Use the existing tracker flow." }],
    });

    expect(result.plan).toMatchObject({
      version: 1,
      status: "ready",
      userGoal: input.userGoal,
      estimatedCost: null,
      metadata: {
        revision: 1,
        actorId: actor.userId,
        createdBy: actor.userId,
        workspaceId,
        createdAt: "2026-09-11T00:00:00.000Z",
      },
      supportedNativeOperations: [{ id: "create_tracker", productId: "tracker" }],
    });
    expect(mocks.saveWork).toHaveBeenCalledWith(actor, workspaceId, expect.objectContaining({
      productId: "work_plans",
      resourceKind: "plan",
      payload: result.plan,
      input: { userGoal: input.userGoal, evidence: [{ label: "User note", value: "Use the existing tracker flow." }] },
    }));
    expect(result.work.id).toBe("33333333-3333-4333-8333-333333333333");
  });

  it("prepares selected saved work as bounded evidence and retains source references only", async () => {
    const sourceWorkId = "44444444-4444-4444-8444-444444444444";
    mocks.getWork.mockResolvedValue({
      id: sourceWorkId,
      workspaceId,
      productId: "documents",
      resourceKind: "document",
      title: "Existing procedure",
      payload: {
        version: 1,
        revision: 2,
        title: "Existing procedure",
        text: "Review the request before assigning an owner.",
        createdBy: actor.userId,
        createdAt: "2026-09-11T00:00:00.000Z",
        history: [],
      },
      createdBy: actor.userId,
      createdAt: "2026-09-11T00:00:00.000Z",
      updatedAt: "2026-09-11T00:02:00.000Z",
    });
    const generate = vi.fn().mockResolvedValue(supportedGeneratedPlan);
    mocks.saveWork.mockImplementation(async (_actor: unknown, _workspaceId: string, saved: Record<string, unknown>) => ({
      id: "55555555-5555-4555-8555-555555555555",
      workspaceId,
      productId: saved.productId,
      resourceKind: saved.resourceKind,
      title: saved.title,
      payload: saved.payload,
      input: saved.input,
      createdBy: actor.userId,
      createdAt: "2026-09-11T00:00:00.000Z",
      updatedAt: "2026-09-11T00:00:00.000Z",
    }));

    const result = await createWorkPlan({
      ...input,
      sourceWorkIds: [sourceWorkId],
      generate,
    });

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      evidence: [expect.objectContaining({ value: expect.stringContaining("Review the request") })],
    }));
    expect(result.plan.context).toEqual({
      version: 1,
      sources: [expect.objectContaining({ workId: sourceWorkId, kind: "document", revision: 2 })],
    });
    expect(mocks.saveWork).toHaveBeenCalledWith(actor, workspaceId, expect.objectContaining({
      input: {
        userGoal: input.userGoal,
        evidence: [],
        context: { version: 1, sources: [expect.objectContaining({ workId: sourceWorkId })] },
      },
    }));
    expect(JSON.stringify(mocks.saveWork.mock.calls[0]?.[2]?.input)).not.toContain("Review the request");
  });
});
