import { beforeEach, describe, expect, it, vi } from "vitest";
import { createResponsibility } from "@/platform/work-execution/engine";

const fixture = vi.hoisted(() => ({
  read: vi.fn(), lookup: vi.fn(), readRun: vi.fn(), record: vi.fn(), execute: vi.fn(), command: vi.fn(),
}));
vi.mock("@/platform/work-execution/repository", () => ({
  readResponsibility: fixture.read, persistResponsibility: vi.fn(), insertResponsibility: vi.fn(),
}));
vi.mock("@/platform/work-execution/runtime", () => ({
  responsibilityCommands: () => ({ create: vi.fn(), command: fixture.command, run: fixture.execute }),
}));
vi.mock("@/platform/work-execution/standing-repository", () => ({
  readStandingRunForWork: fixture.lookup, readStandingRun: fixture.readRun,
  recordStandingRun: fixture.record, readStandingResponsibility: vi.fn(),
  admitStandingResponsibility: vi.fn(), createStandingResponsibility: vi.fn(),
  persistStandingResponsibility: vi.fn(), assertStandingExecutionAllowed: vi.fn(),
}));

import { workspaceResponsibilityCommands } from "@/products/operations/server";
import { sweepDueWork } from "@/products/operations/sweep";

const actor = { userId: "94000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const workId = "94000000-0000-4000-8000-000000000002";
const workspaceId = "94000000-0000-4000-8000-000000000003";
const runId = "94000000-0000-4000-8000-000000000004";
const at = "2026-09-14T12:00:00.000Z";

function completedWork() {
  const payload = createResponsibility({
    title: "Check repair requests", intent: "Check the saved repair requests",
    steps: [{ id: "check", operation: "investigation.run", workId, input: {}, dependsOn: [], maximumCents: 0 }],
  }, actor.userId, at);
  payload.status = "completed";
  const step = payload.steps[0];
  if (!step) throw new Error("The recovery fixture requires a step");
  payload.steps[0] = { ...step, status: "completed", effect: "none", attempt: 1, finishedAt: at, result: { workId } };
  return { id: workId, workspaceId, payload };
}

describe("ongoing job recovery through ordinary execution entrances", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const run = { id: runId, finiteWorkId: workId, attempt: 1, policyVersion: 1, status: "admitted" };
    fixture.read.mockResolvedValue(completedWork());
    fixture.lookup.mockResolvedValue(run);
    fixture.readRun.mockResolvedValue({ run, policy: { policy: { ownerId: actor.userId } } });
    fixture.record.mockImplementation(async (_actor, input) => ({ ...run, ...input, id: runId }));
  });

  it("repairs a lost completion receipt on retry without executing the completed work again", async () => {
    fixture.record.mockRejectedValueOnce(new Error("Receipt storage unavailable"));
    await expect(workspaceResponsibilityCommands.run(actor, workId)).rejects.toThrow("Receipt storage unavailable");
    const result = await workspaceResponsibilityCommands.run(actor, workId);
    expect(result.payload.status).toBe("completed");
    expect(fixture.record).toHaveBeenLastCalledWith(actor, expect.objectContaining({
      runId, status: "completed", attempt: 1,
      receipts: [expect.objectContaining({ stepId: "check", status: "completed", effect: "none" })],
    }));
    expect(fixture.execute).not.toHaveBeenCalled();
    expect(fixture.lookup).toHaveBeenCalledWith(actor, workspaceId, workId);
  });

  it("the background sweep updates the same ongoing run after a restart", async () => {
    expect(await sweepDueWork([{ id: workId, productId: "operations", actor }])).toEqual({ processed: 1, failed: 0, remaining: 0 });
    expect(fixture.record).toHaveBeenCalledWith(actor, expect.objectContaining({ runId, status: "completed" }));
    expect(fixture.execute).not.toHaveBeenCalled();
  });

  it("repairs an uncheckpointed terminal run with a nonzero attempt", async () => {
    const run = { id: runId, finiteWorkId: workId, attempt: 0, policyVersion: 1, status: "admitted" };
    fixture.lookup.mockResolvedValue(run);
    await workspaceResponsibilityCommands.run(actor, workId);
    expect(fixture.record).toHaveBeenCalledWith(actor, expect.objectContaining({
      runId, status: "completed", attempt: 1,
    }));
    expect(fixture.execute).not.toHaveBeenCalled();
  });

  it("refreshes a linked run after a generic finite command", async () => {
    const work = completedWork();
    work.payload.status = "ready";
    const cancelled = { ...work, payload: { ...work.payload, status: "cancelled" as const, revision: work.payload.revision + 1 } };
    const run = { id: runId, finiteWorkId: workId, attempt: 0, policyVersion: 1, status: "admitted" };
    fixture.read.mockResolvedValue(work);
    fixture.lookup.mockResolvedValue(run);
    fixture.command.mockResolvedValue(cancelled);
    await workspaceResponsibilityCommands.command(actor, workId, { kind: "cancel", expectedRevision: work.payload.revision });
    expect(fixture.record).toHaveBeenCalledWith(actor, expect.objectContaining({
      runId, status: "cancelled", attempt: 1,
    }));
  });

  it("keeps a job admitted when a completed step leaves another step ready", async () => {
    const work = completedWork();
    work.payload.status = "ready";
    work.payload.steps.push({
      id: "next_check", operation: "investigation.run", workId, input: {},
      dependsOn: ["check"], maximumCents: 0, capabilityVersion: 1, status: "pending", attempt: 0,
    });
    fixture.read.mockResolvedValue(work);
    fixture.execute.mockResolvedValue(work);
    await workspaceResponsibilityCommands.run(actor, workId);
    expect(fixture.record).toHaveBeenCalledWith(actor, expect.objectContaining({
      runId, status: "admitted", receipts: [expect.objectContaining({ stepId: "check", status: "completed" })],
    }));
  });
});
