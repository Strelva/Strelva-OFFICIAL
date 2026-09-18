import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  operator: vi.fn(),
  payer: vi.fn(),
  reserve: vi.fn(),
  settle: vi.fn(),
}));
vi.mock("@/platform/work-economics/allowances-repository", () => ({
  readStoredWorkAllowances: mocks.read,
  applyOperatorAllowanceCommand: mocks.operator,
  applyPayerAllowanceCommand: mocks.payer,
  reserveStoredWorkAllowance: mocks.reserve,
  settleStoredWorkAllowance: mocks.settle,
}));

import {
  acceptWorkAllowanceCap,
  awardWorkAllowance,
  inspectWorkAllowances,
  reserveAvailableWorkAllowance,
  settleWorkAllowanceExecution,
} from "@/platform/work-economics/allowances-service";

const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "owner@example.com" };
const allowanceId = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";
const inspection = { allowances: [], policy: {} };

describe("work allowance module interface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue(inspection);
    mocks.operator.mockResolvedValue(allowanceId);
    mocks.payer.mockResolvedValue(allowanceId);
    mocks.reserve.mockResolvedValue(null);
    mocks.settle.mockResolvedValue(null);
  });

  it("returns no reservation when a legacy job has no configured allowance", async () => {
    await expect(reserveAvailableWorkAllowance(actor, {
      jobId,
      executionKey: "attempt-1",
      unitKind: "completed_document_change",
      units: 1,
    })).resolves.toBeNull();
    expect(mocks.reserve).toHaveBeenCalledWith(actor, expect.objectContaining({ jobId, units: 1 }));
  });

  it("settles only by the stable existing execution identity", async () => {
    await settleWorkAllowanceExecution(actor, { jobId, executionKey: "attempt-1" });
    expect(mocks.settle).toHaveBeenCalledWith(actor, { jobId, executionKey: "attempt-1" });
    expect(() => settleWorkAllowanceExecution(actor, { jobId, executionKey: "attempt-1", amountCents: 0 })).toThrow("settlement is invalid");
  });

  it("returns the persisted record after an operator award or payer acceptance", async () => {
    await awardWorkAllowance(actor, {
      action: "award_period", workspaceId: allowanceId,
      payerId: jobId, periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-10-01T00:00:00.000Z",
      spendingCapCents: 0, grants: [{ unitKind: "completed_tracker_change", units: 1 }], idempotencyKey: "award-1",
    });
    expect(mocks.read).toHaveBeenLastCalledWith(actor, { allowanceId });
    await acceptWorkAllowanceCap(actor, { action: "accept_spending_cap", allowanceId });
    expect(mocks.payer).toHaveBeenCalledWith(actor, { action: "accept_spending_cap", allowanceId });
  });

  it("requires a bounded read target", async () => {
    await expect(inspectWorkAllowances(actor, {})).rejects.toThrow("allowance or business");
  });
});
