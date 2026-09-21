import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertWorkspaceMember: vi.fn(),
  getWork: vi.fn(),
  readWorkPlanOutput: vi.fn(),
  persistWorkPlanOutput: vi.fn(),
}));

vi.mock("@/platform/workspaces", () => ({
  assertWorkspaceMember: mocks.assertWorkspaceMember,
  getWork: mocks.getWork,
  readWorkPlanOutput: mocks.readWorkPlanOutput,
  persistWorkPlanOutput: mocks.persistWorkPlanOutput,
}));

import {
  executeWorkPlanOutput,
  WorkPlanExecutionConflictError,
  WorkPlanInvalidOutputError,
} from "@/products/work-plans";
import { WorkspaceConflictError } from "@/platform/workspaces/types";

const actor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "owner@example.com" };
const workspaceId = "22222222-2222-4222-8222-222222222222";
const planWorkId = "33333333-3333-4333-8333-333333333333";
const nativeWorkId = "44444444-4444-4444-8444-444444444444";

function planFor(output: Record<string, unknown>, operationId: string, neededInputs: unknown[] = [], context?: unknown) {
  return {
    id: planWorkId,
    workspaceId,
    productId: "work_plans",
    resourceKind: "plan",
    title: "A saved plan",
    payload: {
      version: 1,
      status: "ready",
      userGoal: "Prepare private work",
      summary: "A bounded native output.",
      proposedOutputs: [output],
      steps: [],
      neededInputs,
      supportedNativeOperations: [{
        id: operationId,
        productId: operationId === "create_document" ? "documents" : "tracker",
        resourceKind: operationId === "create_document" ? "document" : "tracker",
        label: operationId,
        effect: "create_resource",
        support: operationId === "create_document" ? "release_gated" : "supported",
        description: "A native private output.",
      }],
      estimatedCost: null,
      requiredDecisions: [],
      ...(context ? { context } : {}),
      metadata: { revision: 1, actorId: actor.userId, createdBy: actor.userId, workspaceId, createdAt: "2026-09-11T00:00:00.000Z" },
    },
    createdBy: actor.userId,
    createdAt: "2026-09-11T00:00:00.000Z",
    updatedAt: "2026-09-11T00:00:00.000Z",
  };
}

function persisted(operationId: string, productId: string, resourceKind: string, replayed = false) {
  return {
    executionId: "55555555-5555-4555-8555-555555555555",
    planWorkId,
    outputId: "output",
    planRevision: 1,
    status: "completed" as const,
    replayed,
    nativeWorkId,
    nativeProductId: productId,
    nativeResourceKind: resourceKind,
    receipt: {
      version: 1,
      kind: "work_plan_output",
      planWorkId,
      outputId: "output",
      planRevision: 1,
      operationId,
      actorId: actor.userId,
      nativeWorkId,
      completedAt: "2026-09-11T00:00:01.000Z",
    },
    createdAt: "2026-09-11T00:00:01.000Z",
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  mocks.assertWorkspaceMember.mockResolvedValue(undefined);
  mocks.readWorkPlanOutput.mockResolvedValue(null);
  mocks.persistWorkPlanOutput.mockImplementation(async (input: { operationId: string; nativeProductId: string; nativeResourceKind: string }) => persisted(input.operationId, input.nativeProductId, input.nativeResourceKind));
});

describe("work-plan output acceptance", () => {
  it("validates a reviewed document draft through the native document engine", async () => {
    const output = {
      id: "output",
      title: "Procedure",
      description: "A private procedure.",
      outcome: "capability",
      nativeOperationIds: ["create_document"],
      draft: { kind: "document", title: "Procedure", text: "Review the request before replying." },
    };
    mocks.getWork.mockResolvedValue(planFor(output, "create_document"));

    const result = await executeWorkPlanOutput({
      actor,
      workspaceId,
      planWorkId,
      outputId: "output",
      expectedPlanRevision: 1,
      operationId: "create_document",
      read: mocks.readWorkPlanOutput,
      persist: mocks.persistWorkPlanOutput,
    });

    expect(result).toMatchObject({ status: "completed", nativeProductId: "documents", nativeResourceKind: "document", nativeWorkId });
    expect(mocks.persistWorkPlanOutput).toHaveBeenCalledWith(expect.objectContaining({
      planWorkId,
      outputId: "output",
      operationId: "create_document",
      nativeProductId: "documents",
      nativeResourceKind: "document",
      nativePayload: expect.objectContaining({ revision: 0, createdBy: actor.userId, text: "Review the request before replying." }),
    }));
  });

  it("creates an empty tracker from a reviewed native template", async () => {
    const output = {
      id: "output",
      title: "Task list",
      description: "A private task tracker.",
      outcome: "capability",
      nativeOperationIds: ["create_tracker"],
      draft: { kind: "tracker", templateId: "tasks", title: "Task list" },
    };
    mocks.getWork.mockResolvedValue(planFor(output, "create_tracker"));

    const result = await executeWorkPlanOutput({
      actor,
      workspaceId,
      planWorkId,
      outputId: "output",
      expectedPlanRevision: 1,
      operationId: "create_tracker",
      read: mocks.readWorkPlanOutput,
      persist: mocks.persistWorkPlanOutput,
    });

    expect(result).toMatchObject({ status: "completed", nativeProductId: "tracker", nativeResourceKind: "tracker" });
    const call = mocks.persistWorkPlanOutput.mock.calls[0]?.[0] as { nativePayload: { tracker: { rows: unknown[]; columns: Array<{ label: string }> } } };
    expect(call.nativePayload.tracker.rows).toEqual([]);
    expect(call.nativePayload.tracker.columns.map(column => column.label)).toEqual(["Task", "Owner", "Due date", "Status", "Notes"]);
  });

  it("requires the plan to be complete before accepting any output", async () => {
    const output = {
      id: "output",
      title: "Procedure",
      description: "A private procedure.",
      outcome: "capability",
      nativeOperationIds: ["create_document"],
      draft: { kind: "document", title: "Procedure", text: "Draft" },
    };
    mocks.getWork.mockResolvedValue(planFor(output, "create_document", [{ id: "missing", label: "Source", reason: "Needed", required: true }]));

    await expect(executeWorkPlanOutput({
      actor,
      workspaceId,
      planWorkId,
      outputId: "output",
      expectedPlanRevision: 1,
      operationId: "create_document",
      read: mocks.readWorkPlanOutput,
      persist: mocks.persistWorkPlanOutput,
    })).rejects.toBeInstanceOf(WorkPlanInvalidOutputError);
    expect(mocks.persistWorkPlanOutput).not.toHaveBeenCalled();
  });

  it("returns the durable replay before rechecking changed source context", async () => {
    const output = {
      id: "output",
      title: "Procedure",
      description: "A private procedure.",
      outcome: "capability",
      nativeOperationIds: ["create_document"],
      draft: { kind: "document", title: "Procedure", text: "Draft" },
    };
    const context = {
      version: 1,
      sources: [{ workId: "66666666-6666-4666-8666-666666666666", productId: "documents", resourceKind: "document", kind: "document", title: "Source", version: 1, revision: 1, updatedAt: "2026-09-11T00:00:00.000Z" }],
    };
    mocks.getWork.mockResolvedValue(planFor(output, "create_document", [], context));
    mocks.readWorkPlanOutput.mockResolvedValue(persisted("create_document", "documents", "document", true));

    const result = await executeWorkPlanOutput({
      actor,
      workspaceId,
      planWorkId,
      outputId: "output",
      expectedPlanRevision: 1,
      operationId: "create_document",
      read: mocks.readWorkPlanOutput,
      persist: mocks.persistWorkPlanOutput,
    });

    expect(result.status).toBe("already_completed");
    expect(mocks.persistWorkPlanOutput).not.toHaveBeenCalled();
  });

  it("replays a pre-capability v1 receipt after the versioned key and digest rollout", async () => {
    const output = {
      id: "output",
      title: "Procedure",
      description: "A private procedure.",
      outcome: "capability",
      nativeOperationIds: ["create_document"],
      draft: { kind: "document", title: "Procedure", text: "Draft" },
    };
    mocks.getWork.mockResolvedValue(planFor(output, "create_document"));
    const legacyReceipt = persisted("create_document", "documents", "document", true);
    mocks.readWorkPlanOutput.mockImplementation(async (key: { idempotencyKey: string }) => {
      if (key.idempotencyKey.endsWith("create_document@1")) throw new WorkspaceConflictError();
      return legacyReceipt;
    });

    const result = await executeWorkPlanOutput({
      actor,
      workspaceId,
      planWorkId,
      outputId: "output",
      expectedPlanRevision: 1,
      operationId: "create_document",
      read: mocks.readWorkPlanOutput,
      persist: mocks.persistWorkPlanOutput,
    });

    expect(result).toMatchObject({ status: "already_completed", nativeWorkId, capabilityVersion: 1, receipt: { capabilityVersion: 1 } });
    expect(mocks.readWorkPlanOutput).toHaveBeenCalledTimes(2);
    const versionedKey = mocks.readWorkPlanOutput.mock.calls[0]?.[0] as { idempotencyKey: string; inputDigest: string };
    const legacyKey = mocks.readWorkPlanOutput.mock.calls[1]?.[0] as { idempotencyKey: string; inputDigest: string };
    expect(versionedKey.idempotencyKey).toContain(":create_document@1");
    expect(legacyKey.idempotencyKey).toContain(":create_document");
    expect(versionedKey.inputDigest).not.toBe(legacyKey.inputDigest);
    expect(mocks.persistWorkPlanOutput).not.toHaveBeenCalled();
  });

  it("does not let a delegated reader accept a plan output", async () => {
    mocks.assertWorkspaceMember.mockRejectedValue(new WorkPlanExecutionConflictError());
    await expect(executeWorkPlanOutput({
      actor,
      workspaceId,
      planWorkId,
      outputId: "output",
      expectedPlanRevision: 1,
      operationId: "create_document",
      read: mocks.readWorkPlanOutput,
      persist: mocks.persistWorkPlanOutput,
    })).rejects.toBeInstanceOf(WorkPlanExecutionConflictError);
    expect(mocks.getWork).not.toHaveBeenCalled();
  });
});
