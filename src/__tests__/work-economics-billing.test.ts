import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));

import {
  ProviderEvidenceMismatchError,
  recordTrustedProviderReceipt,
  subscriptionAllowanceFromStripeEvent,
  syncSubscriptionAllowanceEntitlement,
} from "@/platform/work-economics";

const actor = {
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  verifiedEmail: "owner@example.com",
};
const context = {
  actor,
  jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  executionKey: "provider-1",
  expectedTarget: {
    workspaceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    workId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  },
  maximumCents: 25,
  kind: "provider" as const,
  attribution: "normal" as const,
};

describe("work economics billing contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRELVA_SUBSCRIPTION_ALLOWANCE_CONFIG = JSON.stringify({
      configured_zero_cost_local: {
        grants: [{ unitKind: "completed_tracker_change", units: 2 }],
        spendingCapCents: 0,
      },
    });
  });

  it("turns an explicitly configured Stripe event into one synchronization command", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        disposition: "applied",
        entitlementId: "11111111-1111-4111-8111-111111111111",
        allowanceId: "22222222-2222-4222-8222-222222222222",
        status: "active",
      },
      error: null,
    });
    const result = await syncSubscriptionAllowanceEntitlement({
      version: 1,
      eventId: "evt_billing_1",
      eventCreated: 1790000000,
      subscriptionId: "sub_billing_1",
      customerId: "cus_billing_1",
      workspaceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      payerId: actor.userId,
      configKey: "configured_zero_cost_local",
      status: "active",
      periodStart: "2026-09-01T00:00:00.000Z",
      periodEnd: "2026-10-01T00:00:00.000Z",
      grants: [{ unitKind: "completed_tracker_change", units: 2 }],
      spendingCapCents: 0,
    });
    expect(result.disposition).toBe("applied");
    expect(mocks.rpc).toHaveBeenCalledWith("sync_subscription_allowance_entitlement", {
      p_entitlement: expect.objectContaining({ configKey: "configured_zero_cost_local", spendingCapCents: 0 }),
    });
  });

  it("keeps an event with no selected entitlement terms unavailable", () => {
    delete process.env.STRELVA_SUBSCRIPTION_ALLOWANCE_CONFIG;
    const result = subscriptionAllowanceFromStripeEvent({
      id: "evt_billing_unconfigured",
      created: 1790000001,
      type: "customer.subscription.updated",
      data: { object: {
        id: "sub_billing_unconfigured",
        customer: "cus_billing_unconfigured",
        status: "active",
        current_period_start: 1790000000,
        current_period_end: 1792592000,
        metadata: {
          workspaceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          payerId: actor.userId,
          allowanceConfigKey: "missing_terms",
        },
      } },
    });
    expect(result).toMatchObject({ status: "unavailable", configKey: "missing_terms" });
    expect(result).not.toHaveProperty("grants");
  });

  it("preserves a known subscription as unavailable when no allowance key is selected", () => {
    const result = subscriptionAllowanceFromStripeEvent({
      id: "evt_billing_without_key",
      created: 1790000002,
      type: "customer.subscription.updated",
      data: { object: {
        id: "sub_billing_without_key",
        customer: "cus_billing_without_key",
        status: "active",
        current_period_start: 1790000000,
        current_period_end: 1792592000,
        metadata: {
          workspaceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          payerId: actor.userId,
        },
      } },
    });
    expect(result).toMatchObject({ status: "unavailable", configKey: "unavailable" });
    expect(result).not.toHaveProperty("grants");
  });

  it("binds a decimal provider receipt to the exact execution and settles it once", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "record_work_provider_receipt" || name === "record_work_provider_receipt_decimal"
      ? {
        data: {
          receiptId: "33333333-3333-4333-8333-333333333333",
          replayed: false,
          execution: {
            job_id: context.jobId,
            execution_key: context.executionKey,
            maximum_cents: 25,
            kind: "provider",
            attribution: "normal",
            status: "finished",
            effect: "accepted",
            amount_cents: 20,
            billable_cents: 20,
            created_by: actor.userId,
            reconciliation_reference: "gateway:req_1",
          },
        },
        error: null,
      }
      : { data: null, error: null });
    const result = await recordTrustedProviderReceipt(context, {
      version: 1,
      provider: "fixture-gateway",
      requestId: "req_1",
      executionKey: context.executionKey,
      kind: context.kind,
      attribution: context.attribution,
      maximumCents: context.maximumCents,
      billableUsd: "0.20",
      evidenceReference: "gateway:req_1",
    });
    expect(result.execution.billableCents).toBe(20);
    expect(mocks.rpc).toHaveBeenCalledWith("record_work_provider_receipt_decimal", {
      p_receipt: expect.objectContaining({ jobId: context.jobId, billableUsd: "0.20" }),
    });
    expect(mocks.rpc).toHaveBeenCalledWith("work_allowance_execution_command", expect.objectContaining({
      p_command: { action: "settle", jobId: context.jobId, executionKey: context.executionKey },
    }));
  });

  it("rejects a provider receipt for another execution", async () => {
    await expect(recordTrustedProviderReceipt(context, {
      version: 1,
      provider: "fixture-gateway",
      requestId: "req_wrong_execution",
      executionKey: "another-execution",
      kind: context.kind,
      attribution: context.attribution,
      maximumCents: context.maximumCents,
      billableCents: 20,
      evidenceReference: "gateway:req_wrong_execution",
    })).rejects.toBeInstanceOf(ProviderEvidenceMismatchError);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("sends an exact fractional-cent receipt to the aggregate settlement seam", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "record_work_provider_receipt_decimal"
      ? {
        data: {
          receiptId: "44444444-4444-4444-8444-444444444444",
          replayed: false,
          execution: {
            job_id: context.jobId,
            execution_key: context.executionKey,
            maximum_cents: 25,
            kind: "provider",
            attribution: "normal",
            status: "finished",
            effect: "accepted",
            amount_cents: 0,
            billable_cents: 0,
            created_by: actor.userId,
            reconciliation_reference: "gateway:req_fractional_cent",
          },
        },
        error: null,
      }
      : { data: null, error: null });
    await expect(recordTrustedProviderReceipt(context, {
      version: 1,
      provider: "fixture-gateway",
      requestId: "req_fractional_cent",
      executionKey: context.executionKey,
      kind: context.kind,
      attribution: context.attribution,
      maximumCents: context.maximumCents,
      billableUsd: "0.001",
      evidenceReference: "gateway:req_fractional_cent",
    })).resolves.toMatchObject({ receiptId: "44444444-4444-4444-8444-444444444444", execution: { billableCents: 0 } });
    expect(mocks.rpc).toHaveBeenCalledWith("record_work_provider_receipt_decimal", {
      p_receipt: expect.objectContaining({ billableUsd: "0.001" }),
    });
  });
});
