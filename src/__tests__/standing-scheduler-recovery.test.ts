import { beforeEach, describe, expect, it, vi } from "vitest";
import { createResponsibility } from "@/platform/work-execution/engine";

const fixture = vi.hoisted(() => ({
  policy: vi.fn(),
  trigger: vi.fn(),
  admission: vi.fn(),
  readRun: vi.fn(),
  readForWork: vi.fn(),
  readFinite: vi.fn(),
  record: vi.fn(),
  execute: vi.fn(),
  command: vi.fn(),
  readInvestigation: vi.fn(),
  economicsRead: vi.fn(),
  economicsCommand: vi.fn(),
}));

vi.mock("@/platform/work-execution/repository", () => ({
  readResponsibility: fixture.readFinite,
  persistResponsibility: vi.fn(),
  insertResponsibility: vi.fn(),
}));
vi.mock("@/platform/work-execution/runtime", () => ({
  responsibilityCommands: () => ({ create: vi.fn(), command: fixture.command, run: fixture.execute }),
}));
vi.mock("@/platform/work-execution/standing-repository", () => ({
  readStandingResponsibility: fixture.policy,
  readStandingRunForTrigger: fixture.trigger,
  admitStandingResponsibility: fixture.admission,
  readStandingRun: fixture.readRun,
  readStandingRunForWork: fixture.readForWork,
  recordStandingRun: fixture.record,
  createStandingResponsibility: vi.fn(),
  persistStandingResponsibility: vi.fn(),
  assertStandingExecutionAllowed: vi.fn(),
}));
vi.mock("@/products/investigations/server", () => ({
  readWorkspaceInvestigation: fixture.readInvestigation,
  runWorkspaceInvestigation: vi.fn(),
}));
vi.mock("@/platform/work-economics/service", () => ({
  readJobEconomics: fixture.economicsRead,
  executeJobEconomicsCommand: fixture.economicsCommand,
}));

import {
  admitAndRunDueStandingResponsibility,
  admitStandingResponsibility,
} from "@/products/operations/server";
import { sweepDueWork } from "@/products/operations/sweep";

const actor = {
  userId: "94000000-0000-4000-8000-000000000001",
  verifiedEmail: "owner@example.test",
};
const standingId = "94000000-0000-4000-8000-000000000002";
const sourceId = "94000000-0000-4000-8000-000000000003";
const finiteWorkId = "94000000-0000-4000-8000-000000000004";
const runId = "94000000-0000-4000-8000-000000000005";
const jobId = "94000000-0000-4000-8000-000000000006";
const dueAt = "2026-09-14T12:00:00.000Z";
const nextAt = "2026-09-14T13:00:00.000Z";

function policyRecord() {
  return {
    id: standingId,
    workspaceId: "94000000-0000-4000-8000-000000000007",
    policy: {
      version: 1,
      revision: 1,
      title: "Check supplier records",
      intent: "Compare the saved supplier records on each interval.",
      ownerId: actor.userId,
      status: "active" as const,
      approvedBy: actor.userId,
      approvedAt: dueAt,
      scope: {
        steps: [{
          id: "check",
          operation: "investigation.run" as const,
          workId: sourceId,
          input: {},
          dependsOn: [],
          maximumCents: 0,
        }],
      },
      trigger: { kind: "interval" as const, everySeconds: 3600, nextAt: dueAt },
      limits: { maxConcurrentJobs: 1, maxRuns: null },
      exclusions: [],
      createdAt: dueAt,
      updatedAt: dueAt,
      history: [{ revision: 1, kind: "approve" as const, actorId: actor.userId, at: dueAt }],
    },
  };
}

function completedFiniteWork() {
  const payload = createResponsibility({
    title: "Check supplier records",
    intent: "Compare the saved supplier records on each interval.",
    steps: [{
      id: "check",
      operation: "investigation.run",
      workId: sourceId,
      input: { expectedRevision: 0, requestId: "standing:check" },
      dependsOn: [],
      maximumCents: 0,
    }],
  }, actor.userId, dueAt);
  const step = payload.steps[0];
  if (!step) throw new Error("The scheduler fixture requires a step");
  payload.status = "completed";
  payload.steps[0] = {
    ...step,
    status: "completed",
    attempt: 1,
    effect: "none",
    finishedAt: dueAt,
    result: { workId: sourceId },
  };
  return { id: finiteWorkId, workspaceId: policyRecord().workspaceId, payload };
}

describe("local standing scheduler recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    const run = {
      id: runId,
      standingResponsibilityId: standingId,
      jobId,
      finiteWorkId,
      triggerKey: `interval:${dueAt}`,
      policyVersion: 1,
      status: "admitted" as const,
      attempt: 0,
      createdAt: dueAt,
      updatedAt: dueAt,
    };
    const job = {
      id: jobId,
      standingResponsibilityId: standingId,
      finiteWorkId,
      triggerKey: `interval:${dueAt}`,
      policyVersion: 1,
      status: "accepted" as const,
      acceptedAt: dueAt,
      createdAt: dueAt,
      updatedAt: dueAt,
    };
    let accepted = false;

    fixture.policy.mockResolvedValue(policyRecord());
    fixture.readInvestigation.mockResolvedValue({
      id: sourceId,
      workspaceId: policyRecord().workspaceId,
      payload: { revision: 0 },
    });
    fixture.trigger.mockImplementation(async () => accepted ? { job, run } : null);
    fixture.admission.mockImplementation(async () => {
      accepted = true;
      return { policy: policyRecord(), job, run, replayed: false };
    });
    fixture.readRun.mockResolvedValue({ run, policy: policyRecord() });
    fixture.readForWork.mockResolvedValue(run);
    fixture.readFinite.mockResolvedValue(completedFiniteWork());
    fixture.record
      .mockRejectedValueOnce(new Error("Receipt storage unavailable"))
      .mockImplementation(async (_actor, input) => ({ ...run, ...input }));
  });

  it("admits one due local run, recovers a lost terminal receipt, and preserves zero-cost execution", async () => {
    await expect(admitAndRunDueStandingResponsibility(actor, standingId)).rejects.toThrow("Receipt storage unavailable");

    const duplicate = await admitStandingResponsibility(actor, standingId, {
      triggerKey: `interval:${dueAt}`,
      expectedVersion: 1,
    });
    expect(duplicate).toMatchObject({ replayed: true, run: { id: runId }, job: { id: jobId } });
    expect(fixture.admission).toHaveBeenCalledTimes(1);
    expect(fixture.admission).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        standingResponsibilityId: standingId,
        triggerKey: `interval:${dueAt}`,
        expectedVersion: 1,
        nextAt,
      }),
      expect.objectContaining({ id: standingId }),
      expect.objectContaining({ status: "ready" }),
    );

    expect(await sweepDueWork([{ id: finiteWorkId, productId: "operations", actor }])).toEqual({
      processed: 1,
      failed: 0,
      remaining: 0,
      failures: [],
    });
    expect(fixture.execute).not.toHaveBeenCalled();
    expect(fixture.record).toHaveBeenLastCalledWith(actor, expect.objectContaining({
      runId,
      status: "completed",
      attempt: 1,
      receipts: [expect.objectContaining({
        stepId: "check",
        attempt: 1,
        status: "completed",
        effect: "none",
      })],
    }));

    const [, , , finitePayload] = fixture.admission.mock.calls[0] as [unknown, unknown, unknown, Record<string, unknown>];
    const steps = finitePayload.steps as Array<Record<string, unknown>>;
    expect(finitePayload.budgetId).toBeUndefined();
    expect(steps[0]).toMatchObject({ maximumCents: 0, operation: "investigation.run" });
    expect(fixture.economicsRead).not.toHaveBeenCalled();
    expect(fixture.economicsCommand).not.toHaveBeenCalled();
  });
});
