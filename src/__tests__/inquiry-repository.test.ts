import { describe, expect, it } from "vitest";
import type { InquiryEngineState } from "@/products/inquiries/contracts";
import {
  createInMemoryInquiryRepository,
  durableState,
  InquiryValidationError,
} from "@/products/inquiries/repository";

function state(businessId = "11111111-1111-4111-8111-111111111111"): InquiryEngineState {
  return {
    stateVersion: 1,
    requests: [{
      id: "req_1", businessId, capabilityId: "cap_1", actorId: "person_1", intent: "buyer inquiry",
      shape: {} as InquiryEngineState["requests"][number]["shape"], plan: null, draft: null,
      state: "shaped", activeChangeId: null, publishApproval: null, rehearsalScenarioIds: ["scenario_1"],
      rehearsalRunIds: ["run_1"], lastLiveChangeId: null, createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z", failureReason: null,
    }],
    capabilities: [{
      id: "cap_1", businessId, status: "draft", live: null, previousLive: null,
      activeRequestId: "req_1", updatedAt: "2026-01-01T00:00:00.000Z",
    }],
    changes: [{
      id: "change_1", businessId, requestId: "req_1", capabilityId: "cap_1", baseVersion: null,
      targetVersion: 1, status: "draft", summary: "1 form", items: [{
        id: "item_1", kind: "form", path: "form.title", before: { title: "Old" }, after: { title: "New" },
        sources: ["manual"], editIds: ["edit_1"],
      }], preservedInquiryIds: ["lead_1"], undoOfChangeId: null, undoAvailable: false,
      actorIds: ["person_1"], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      providerAcceptanceId: null, providerReceipt: null, verification: null, failureReason: null,
    }],
    actionReceipts: [{
      id: "receipt_1", businessId, requestId: "req_1", capabilityId: "cap_1", inquiryId: "lead_1",
      responsibilityId: null, actor: { kind: "person", id: "person_1" }, action: "saw jane@example.com",
      what: "Reviewed 555-555-0123", why: "Requested by the owner", lookedAt: ["lead_1"], outcome: "recorded",
      evidence: ["jane@example.com"], createdAt: "2026-01-01T00:00:00.000Z",
    }],
    rehearsalScenarios: [{
      id: "scenario_1", businessId, capabilityId: "cap_1", name: "Buyer path",
      customerFields: { name: "Synthetic Jane", email: "synthetic@example.test", message: "Synthetic request" },
      createdAt: "2026-01-01T00:00:00.000Z",
    }],
    rehearsalRuns: [{
      id: "run_1", scenarioId: "scenario_1", requestId: "req_1", businessId, capabilityId: "cap_1",
      definitionVersion: 1, mode: "rehearsal", checks: [{ id: "form", label: "form", status: "passed", detail: "ok" }],
      passed: true, passedCount: 1, totalCount: 1, fastForwardMinutes: 1440,
      syntheticRecord: { id: "synthetic_1", persisted: false, fields: { name: "Synthetic Jane" } },
      testInbox: [{ to: "test@example.test", subject: "Synthetic", body: "Synthetic body", disclosedAs: "Strelva" }],
      outboundMessages: [{ to: "test@example.test", body: "Synthetic body", disclosedAs: "Strelva" }],
      externalWritesBlocked: true, externalWriteEvidence: ["synthetic provider blocked"],
      nothingLive: true, ranAt: "2026-01-01T00:00:00.000Z",
    }],
    inquiries: [{
      id: "lead_1", businessId, capabilityId: "cap_1", capabilityVersion: 1,
      fields: { name: "Jane Customer", email: "jane@example.com", message: "Private request" }, status: "new",
      receivedAt: "2026-01-01T00:00:00.000Z", timelineEventIds: ["timeline_1"], createdReceiptId: "receipt_1",
    }],
    timeline: [{
      id: "timeline_1", inquiryId: "lead_1", businessId, capabilityId: "cap_1", type: "received",
      actor: { kind: "customer", id: "lead_1" }, summary: "Received from jane@example.com", at: "2026-01-01T00:00:00.000Z",
      receiptId: "receipt_1", causedByEventId: null, outcome: "recorded", evidence: ["555-555-0123"],
    }],
    responsibilities: [],
    responsibilityReceipts: [],
  };
}

describe("inquiry durable repository", () => {
  it("strips Redis inquiry records while preserving canonical receipts, change items, and rehearsal fixtures", () => {
    const saved = durableState(state());
    expect(saved.inquiries).toEqual([]);
    expect(saved.changes[0]?.items[0]?.before).toEqual({ title: "Old" });
    expect(saved.changes[0]?.preservedInquiryIds).toEqual(["lead_1"]);
    expect(saved.rehearsalScenarios[0]?.customerFields).toEqual({ name: "Synthetic Jane", email: "synthetic@example.test", message: "Synthetic request" });
    expect(saved.rehearsalRuns[0]?.syntheticRecord?.fields).toEqual({ name: "Synthetic Jane" });
    expect(saved.rehearsalRuns[0]?.outboundMessages[0]?.body).toBe("Synthetic body");
    expect(saved.actionReceipts[0]?.action).not.toContain("jane@example.com");
    expect(saved.timeline[0]?.summary).not.toContain("jane@example.com");
  });

  it("rejects nested cross-business state and stale compare-and-swap writes", async () => {
    const repository = createInMemoryInquiryRepository();
    await expect(repository.compareAndSwap({ tenantId: "example", businessId: "11111111-1111-4111-8111-111111111111", expectedRevision: null, state: state() })).resolves.toMatchObject({ changed: true });
    const conflict = await repository.compareAndSwap({ tenantId: "example", businessId: "11111111-1111-4111-8111-111111111111", expectedRevision: 1, state: state() });
    expect(conflict.changed).toBe(true);
    const stale = await repository.compareAndSwap({ tenantId: "example", businessId: "11111111-1111-4111-8111-111111111111", expectedRevision: 1, state: state() });
    expect(stale).toMatchObject({ changed: false, reason: "conflict" });
    const foreign = state();
    foreign.capabilities[0]!.live = { businessId: "other-business" } as never;
    await expect(repository.compareAndSwap({ tenantId: "other", businessId: "11111111-1111-4111-8111-111111111111", expectedRevision: null, state: foreign })).rejects.toBeInstanceOf(InquiryValidationError);
  });

  it("returns an acquired winner and a non-executing loser for one publication command", async () => {
    const repository = createInMemoryInquiryRepository();
    const input = { tenantId: "example", businessId: "business-1", requestId: "req_1", capabilityId: "cap_1", changeId: "change_1", action: "make_live" as const, version: 2, idempotencyKey: "publish-1", actorId: "person_1" };
    const winner = await repository.claimPublication(input);
    const loser = await repository.claimPublication(input);
    expect(winner.acquired).toBe(true);
    expect(loser).toMatchObject({ acquired: false, reason: "already_claimed" });
    if (!winner.acquired) throw new Error("expected claim winner");
    await expect(repository.markPublicationAccepted({ tenantId: "example", claimId: winner.claim.id, claimToken: "wrong", acceptanceId: "provider-1" })).rejects.toBeInstanceOf(InquiryValidationError);
    const accepted = await repository.markPublicationAccepted({ tenantId: "example", claimId: winner.claim.id, claimToken: winner.claimToken, acceptanceId: "provider-1", providerReceipt: { id: "provider-1", token: "secret", recipient: "jane@example.com" } });
    expect(accepted.status).toBe("accepted");
    expect(accepted.providerReceipt).toEqual({ id: "provider-1", recipient: "[redacted email]" });
    const verified = await repository.markPublicationFailed({ tenantId: "example", claimId: winner.claim.id, claimToken: winner.claimToken, reason: "readback unavailable", verificationFailed: true });
    expect(verified.status).toBe("verification_failed");
    const retry = await repository.claimPublication(input);
    expect(retry).toMatchObject({ acquired: false, reason: "already_accepted" });
  });

  it("rejects idempotency-key payload and actor reuse", async () => {
    const repository = createInMemoryInquiryRepository();
    const first = await repository.claimPublication({ tenantId: "example", businessId: "business-1", requestId: "req_1", capabilityId: "cap_1", changeId: "change_1", action: "make_live", version: 1, idempotencyKey: "same", actorId: "person_1" });
    expect(first.acquired).toBe(true);
    await expect(repository.claimPublication({ tenantId: "example", businessId: "business-1", requestId: "req_2", capabilityId: "cap_1", changeId: "change_1", action: "make_live", version: 1, idempotencyKey: "same", actorId: "person_1" })).rejects.toBeInstanceOf(InquiryValidationError);
    await expect(repository.claimPublication({ tenantId: "example", businessId: "business-1", requestId: "req_1", capabilityId: "cap_1", changeId: "change_1", action: "make_live", version: 1, idempotencyKey: "same", actorId: "person_2" })).rejects.toBeInstanceOf(InquiryValidationError);
  });
});
