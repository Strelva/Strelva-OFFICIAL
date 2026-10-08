import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inquiryRecordsRpc } from "@/platform/infra/inquiry-records";
import { claimInquiryMessagePurpose, releaseRejectedInquiryMessagePurpose } from "@/products/inquiries/message-purpose";
import { createMemoryInquiryDeliveryStore, deliverInquiryAction, type InquiryDeliveryDependencies, type InquiryOutboundTransport } from "@/products/inquiries/delivery";

vi.mock("@/platform/infra/inquiry-records", async (original) => ({ ...await original<typeof import("@/platform/infra/inquiry-records")>(), inquiryRecordsRpc: vi.fn() }));
vi.mock("@/platform/infra/tenant-crm", () => ({ addTenantActivity: vi.fn() }));
const rpc = vi.mocked(inquiryRecordsRpc);
const attemptId = "d0000000-0000-4000-8000-0000000000f8";
const now = new Date("2026-10-05T12:00:00Z");
const inquiry = { id: "lead_one", tenantId: "fixture", name: "Dana", email: "dana@example.test", message: "Hello", receivedAt: "2026-10-05T10:00:00Z" };
const policy = { version: "one", paused: false, autoReply: { mode: "auto" as const, enabled: true, delayHours: 0, budgetHours: 24, maxAttempts: 2 }, ownerNotification: "legacy" as const };
function dependencies(send: InquiryOutboundTransport["send"]): InquiryDeliveryDependencies {
  return { store: createMemoryInquiryDeliveryStore(), now: () => now,
    transport: { send, verify: vi.fn(async () => ({ status: "unavailable" as const, reason: "no readback" })) },
    resolveRoute: async () => ({ tenantId: "fixture", businessName: "Fixture", customerEmail: inquiry.email, ownerEmail: "owner@example.test", ownerNotification: "legacy" as const, customerReplyTo: "owner@example.test" }),
    isWorkspaceExited: async () => false,
    getResponsibilityGate: async (_tenant, _inquiry, action) => ({ allowed: true, action, evaluation: null,
      budget: { limit: 10, timezone: "UTC", policyVersion: "one", now: now.toISOString() } }),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRELVA_INQUIRY_REPLIES", "1"); vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1"); vi.stubEnv("DUAL_WRITE_PG", "1");
});
afterEach(() => vi.unstubAllEnvs());
describe("shared first-reply purpose", () => {
  it("preserves flags-off and unrelated message purposes without Postgres I/O", async () => {
    vi.stubEnv("STRELVA_INQUIRY_REPLIES", "0");
    expect(await claimInquiryMessagePurpose("fixture", "lead_one", "reply", attemptId)).toBe(true);
    vi.stubEnv("STRELVA_INQUIRY_REPLIES", "1");
    expect(await claimInquiryMessagePurpose("fixture", "lead_one", "owner_notification", attemptId)).toBe(true);
    expect(await claimInquiryMessagePurpose("fixture", "lead_one", "schedule_follow_up", attemptId)).toBe(true);
    await releaseRejectedInquiryMessagePurpose("fixture", "lead_one", "owner_notification", attemptId);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("blocks the governed transport when an owner or other engine already claimed", async () => {
    rpc.mockResolvedValue(false);
    const send = vi.fn();
    const result = await deliverInquiryAction(inquiry, "reply", { policy, deps: dependencies(send) });
    expect(result).toMatchObject({ status: "paused", reason: "reply_purpose_already_claimed", retryable: false });
    expect(send).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("claim_engine_inquiry_reply", expect.objectContaining({ p_tenant_id: "fixture", p_lead_id: "lead_one" }));
  });
  it("fails closed on a database outage or ambiguous claim result", async () => {
    const send = vi.fn();
    rpc.mockRejectedValueOnce(new Error("timeout"));
    expect(await deliverInquiryAction(inquiry, "reply", { policy, deps: dependencies(send) })).toMatchObject({ status: "reconciliation_required", reason: "shared_reply_claim_unavailable" });
    rpc.mockResolvedValueOnce({ acquired: true });
    expect(await deliverInquiryAction(inquiry, "reply", { policy, deps: dependencies(send) })).toMatchObject({ reason: "reply_purpose_already_claimed" });
    expect(send).not.toHaveBeenCalled();
  });
  it("retains the claim after acceptance with unavailable readback and after ambiguous send", async () => {
    rpc.mockResolvedValue(true);
    const accepted = vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "provider-one", acceptedAt: now.toISOString() }));
    expect(await deliverInquiryAction(inquiry, "reply", { policy, deps: dependencies(accepted) })).toMatchObject({ status: "accepted_unverified" });
    const unknown = vi.fn(async () => ({ status: "unknown" as const, reason: "timeout" }));
    expect(await deliverInquiryAction(inquiry, "reply", { policy, deps: dependencies(unknown) })).toMatchObject({ status: "reconciliation_required" });
    expect(rpc.mock.calls.every(([name]) => name === "claim_engine_inquiry_reply")).toBe(true);
  });
  it("releases only a known provider rejection, using the exact claimed attempt", async () => {
    rpc.mockResolvedValue(true);
    const rejected = vi.fn(async () => ({ status: "rejected" as const, reason: "email paused", outcome: "suppressed" as const, retryable: true }));
    await deliverInquiryAction(inquiry, "reply", { policy, deps: dependencies(rejected) });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual(["release_rejected_engine_inquiry_reply", rpc.mock.calls[0]![1]]);
  });
});
