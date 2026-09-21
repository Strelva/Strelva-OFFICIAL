import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));

import { reserveStoredWorkAllowance } from "@/platform/work-economics/allowances-repository";

const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "owner@example.com" };

describe("work allowance storage adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts the trusted retry receipt shape with zero customer reservation", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        allowanceId: "11111111-1111-4111-8111-111111111111",
        jobId: "22222222-2222-4222-8222-222222222222",
        executionKey: "retry-1",
        unitKind: "completed_tracker_change",
        reservedUnits: 0,
        reservedCapCents: 0,
        status: "reserved",
        consumedUnits: 0,
        actualCostCents: null,
        capCostCents: null,
        disposition: "reserved",
      },
      error: null,
    });

    await expect(reserveStoredWorkAllowance(actor, {
      jobId: "22222222-2222-4222-8222-222222222222",
      executionKey: "retry-1",
      unitKind: "completed_tracker_change",
      units: 1,
    })).resolves.toMatchObject({ reservedUnits: 0, reservedCapCents: 0 });
  });
});
