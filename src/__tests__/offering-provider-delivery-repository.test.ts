import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc }) }));
const projection = vi.hoisted(() => ({ released: vi.fn(), finite: vi.fn() }));
vi.mock("@/platform/release-flags/store", () => ({ workspaceReleaseFlagEnabled: projection.released }));
vi.mock("@/platform/finite-jobs", () => ({ readFiniteJobs: projection.finite, finiteJobDeliveries: vi.fn() }));

import { postgresProviderDeliveries } from "@/platform/offerings/provider-delivery-repository";

describe("provider delivery repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps named agency delivery reads scoped when the customer finite-job projection is on", async () => {
    projection.released.mockResolvedValue(true);
    projection.finite.mockRejectedValue(new Error("Customer membership required"));
    rpc.mockResolvedValue({ error: null, data: [] });
    const actor = { userId: "10000000-0000-4000-8000-000000000006", verifiedEmail: "agency@example.test" };
    await expect(postgresProviderDeliveries.list(actor, "10000000-0000-4000-8000-000000000002")).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith("read_provider_deliveries", expect.objectContaining({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail }));
    expect(projection.finite).not.toHaveBeenCalled();
  });

  it("preserves native assignment access denial and source unavailability", async () => {
    const actor = { userId: "10000000-0000-4000-8000-000000000006", verifiedEmail: "agency@example.test" };
    rpc.mockResolvedValue({ data: null, error: { message: "provider_delivery_denied" } });
    await expect(postgresProviderDeliveries.list(actor, "10000000-0000-4000-8000-000000000002")).rejects.toThrow("unavailable to your account");
    rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    await expect(postgresProviderDeliveries.list(actor, "10000000-0000-4000-8000-000000000002")).rejects.toThrow();
    expect(projection.finite).not.toHaveBeenCalled();
  });

  it("accepts PostgreSQL offset timestamps from the connected RPC boundary", async () => {
    rpc.mockResolvedValue({ error: null, data: [{
      id: "10000000-0000-4000-8000-000000000001",
      business_workspace_id: "10000000-0000-4000-8000-000000000002",
      installation_id: "10000000-0000-4000-8000-000000000003",
      assignment_id: "10000000-0000-4000-8000-000000000004",
      status: "accepted", customer_decision: "pending", revision: 2,
      scope: ["submit_requests"], requested_by: "10000000-0000-4000-8000-000000000005",
      requested_at: "2026-09-18T12:00:00+00:00", expires_at: "2026-09-19T12:00:00+00:00",
      accepted_by: "10000000-0000-4000-8000-000000000006", accepted_at: "2026-09-18T12:01:00+00:00",
      revoked_by: null, revoked_at: null, revocation_reason: null,
      decided_by: null, decided_at: null, decision_note: null,
      history: [{ kind: "requested", actorId: "10000000-0000-4000-8000-000000000005", at: "2026-09-18T12:00:00+00:00", note: null },
        { kind: "accepted", actorId: "10000000-0000-4000-8000-000000000006", at: "2026-09-18T12:01:00+00:00", note: null }],
    }] });

    const deliveries = await postgresProviderDeliveries.list(
      { userId: "10000000-0000-4000-8000-000000000005", verifiedEmail: "owner@example.test" },
      "10000000-0000-4000-8000-000000000002",
    );
    expect(deliveries[0]).toMatchObject({ status: "accepted", requestedAt: "2026-09-18T12:00:00+00:00" });
  });
});
