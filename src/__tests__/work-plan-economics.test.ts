import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertCanSaveWork: vi.fn(),
  saveWork: vi.fn(),
  executeBudgetedAction: vi.fn(),
}));

vi.mock("@/platform/workspaces", () => ({
  assertCanSaveWork: mocks.assertCanSaveWork,
  saveWork: mocks.saveWork,
}));
vi.mock("@/platform/work-economics", () => ({ executeBudgetedAction: mocks.executeBudgetedAction }));

import {
  createWorkPlan,
  presentWorkPlan,
  WorkPlanFundingRequiredError,
} from "@/products/work-plans/server";

const actor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "owner@example.com" };
const workspaceId = "22222222-2222-4222-8222-222222222222";
const planningReceipt = {
  jobId: "33333333-3333-4333-8333-333333333333",
  executionKey: "plan-call-1",
  maximumCents: 100,
  kind: "model" as const,
  attribution: "normal" as const,
  status: "finished" as const,
  effect: "accepted" as const,
  amountCents: null,
  billableCents: null,
  createdBy: actor.userId,
};
const generated = {
  status: "ready" as const,
  summary: "A bounded private tracker.",
  proposedOutputs: [{
    id: "tracker-output",
    title: "Tracker",
    description: "A private tracker.",
    outcome: "capability" as const,
    nativeOperationIds: ["create_tracker"],
  }],
  steps: [],
  neededInputs: [],
  supportedNativeOperationIds: ["create_tracker"],
  requiredDecisions: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRELVA_PLANNING_ENABLED", "1");
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
  mocks.assertCanSaveWork.mockResolvedValue(undefined);
  mocks.saveWork.mockImplementation(async (_actor: unknown, workspace: string, input: Record<string, unknown>) => ({
    id: "44444444-4444-4444-8444-444444444444",
    workspaceId: workspace,
    productId: input.productId,
    resourceKind: input.resourceKind,
    title: input.title,
    payload: input.payload,
    input: input.input,
    createdBy: actor.userId,
    createdAt: "2026-09-18T00:00:00.000Z",
    updatedAt: "2026-09-18T00:00:00.000Z",
  }));
});

describe("planning economics boundary", () => {
  it("rejects a model-backed plan before any provider call without an accepted funding job", async () => {
    await expect(createWorkPlan({ actor, workspaceId, userGoal: "Make a tracker" }))
      .rejects.toBeInstanceOf(WorkPlanFundingRequiredError);
    expect(mocks.executeBudgetedAction).not.toHaveBeenCalled();
  });

  it("reserves the workspace-scoped job and returns an unknown-cost receipt", async () => {
    mocks.executeBudgetedAction.mockImplementation(async (_actor: unknown, input: Record<string, unknown>, handlers: { perform: () => Promise<unknown> }) => {
      expect(input).toMatchObject({
        jobId: planningReceipt.jobId,
        executionKey: planningReceipt.executionKey,
        maximumCents: planningReceipt.maximumCents,
        kind: "model",
        expectedTarget: { workspaceId, workId: null },
      });
      await handlers.perform();
      return { disposition: "performed", value: generated, execution: planningReceipt };
    });

    const generate = vi.fn().mockResolvedValue(generated);
    const result = await createWorkPlan({
      actor,
      workspaceId,
      userGoal: "Make a tracker",
      planningEconomics: { jobId: planningReceipt.jobId, executionKey: planningReceipt.executionKey, maximumCents: 100 },
      generate,
    });

    expect(result.planningReceipt).toMatchObject({ effect: "accepted", amountCents: null, maximumCents: 100 });
    expect(presentWorkPlan(result)).toMatchObject({ planningEconomics: { jobId: planningReceipt.jobId, executionKey: planningReceipt.executionKey, amountCents: null } });
    expect(mocks.executeBudgetedAction).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      executionContext: {
        actor,
        expectedTarget: { workspaceId, workId: null },
        jobId: planningReceipt.jobId,
        executionKey: planningReceipt.executionKey,
        maximumCents: planningReceipt.maximumCents,
        kind: "model",
        attribution: "normal",
      },
    }));
    expect(result.plan.estimatedCost).toBeNull();
  });

  it("does not turn a durable replay into a second planning result", async () => {
    mocks.executeBudgetedAction.mockResolvedValue({ disposition: "replayed", execution: planningReceipt });
    await expect(createWorkPlan({
      actor,
      workspaceId,
      userGoal: "Make a tracker",
      planningEconomics: { jobId: planningReceipt.jobId, executionKey: planningReceipt.executionKey, maximumCents: 100 },
      generate: vi.fn().mockResolvedValue(generated),
    })).rejects.toThrow(/durable receipt/i);
    expect(mocks.saveWork).not.toHaveBeenCalled();
  });
});
