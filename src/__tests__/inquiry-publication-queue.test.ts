import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InquiryRepository, PublicationClaim } from "@/products/inquiries/repository";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import { tenantEventItem } from "@/platform/needs-you/adapters";

const mocks = vi.hoisted(() => ({ addEvent: vi.fn() }));
vi.mock("@/lib/events", () => ({ addEvent: mocks.addEvent }));
vi.mock("@/products/inquiries/workspace-exit", () => ({
  assertInquiryWorkspaceOpen: vi.fn(async () => undefined),
}));

import { queueInquiryPublication } from "@/products/inquiries/server";

const time = "2026-09-11T12:00:00.000Z";
const claim: PublicationClaim = {
  id: "claim-1",
  tenantId: "acme",
  tenantStableId: "stable-acme",
  businessId: "stable-acme",
  requestId: "work-1",
  capabilityId: "cap-1",
  changeId: "change-1",
  action: "make_live",
  version: 2,
  idempotencyKey: "publish-change-1-v2",
  commandDigest: "a".repeat(64),
  status: "claimed",
  acceptanceId: null,
  providerReceipt: null,
  failureReason: null,
  actorId: "user-1",
  governanceEventId: null,
  createdAt: time,
  acceptedAt: null,
  updatedAt: time,
};

function repository() {
  const engine = new InquiryEngine({ businessId: input.businessId, now: () => time });
  const original = engine.start({ actorId: input.actorId, intent: "quote inquiry" });
  engine.acceptShape(original.id, { actorId: input.actorId });
  const state = engine.snapshot();
  state.requests[0]!.id = input.requestId; state.requests[0]!.capabilityId = input.capabilityId;
  state.requests[0]!.activeChangeId = input.changeId; state.requests[0]!.draft!.version = input.version;
  state.capabilities[0]!.id = input.capabilityId;
  return {
    getSnapshot: vi.fn(async () => ({ state })),
    claimPublication: vi.fn(async () => ({ acquired: true as const, claim, claimToken: "server-only-claim-token" })),
    linkPublicationEvent: vi.fn(async () => ({ ...claim, governanceEventId: "event-1" })),
    markPublicationFailed: vi.fn(async () => ({ ...claim, status: "failed" as const })),
  } as unknown as InquiryRepository;
}

const input = {
  tenantId: "acme",
  businessId: "stable-acme",
  requestId: "work-1",
  capabilityId: "cap-1",
  changeId: "change-1",
  action: "make_live" as const,
  version: 2,
  idempotencyKey: "publish-change-1-v2",
  actorId: "user-1",
};

describe("inquiry publication queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addEvent.mockResolvedValue({ id: "event-1" });
  });

  it("keeps publication claim ownership outside browser-visible event metadata", async () => {
    const store = repository();

    const result = await queueInquiryPublication({ ...input, repository: store });

    expect(result).toMatchObject({ acquired: true, eventId: "event-1" });
    const queued = mocks.addEvent.mock.calls[0]?.[0];
    expect(queued.metadata).toMatchObject({
      kind: "inquiry_capability_publish",
      publicationClaimId: "claim-1",
    });
    expect(JSON.stringify(queued)).not.toContain("server-only-claim-token");
    expect(JSON.stringify(result)).not.toContain("server-only-claim-token");
    expect(queued.title).toBe("Make the inquiry form live");
    expect(queued.body).toContain("release 2 for acme");
    expect(queued.body).toContain("Appears in: acme's website inquiry form");
    expect(queued.body).toContain("Routing:"); expect(queued.body).toContain("Follow-up:");
    expect(queued.body).toContain("Sender: Strelva via mail.strelva.com");
    expect(queued.body).not.toMatch(/capability|rehearsal|responsibility|agent/i);
    expect(tenantEventItem({ ...queued, id: "event-1", createdAt: time })?.detail).toBe(queued.body);
  });

  it("a changed draft closes the claim without emailing a different release", async () => {
    const store = repository();
    const snapshot = await store.getSnapshot(input.tenantId, input.businessId);
    snapshot!.state.requests[0]!.draft!.version = 3;
    await expect(queueInquiryPublication({ ...input, summary: "Make this sound safe", repository: store })).rejects.toThrow("This changed since we emailed you");
    expect(mocks.addEvent).not.toHaveBeenCalled();
    expect(store.markPublicationFailed).toHaveBeenCalled();
  });

  it("an undo confirms its new immutable release and preserves records when removing the first form", async () => {
    const store = repository(); const snapshot = await store.getSnapshot(input.tenantId, input.businessId);
    snapshot!.state.capabilities[0]!.live = snapshot!.state.requests[0]!.draft;
    snapshot!.state.requests[0]!.lastLiveChangeId = input.changeId;
    await queueInquiryPublication({ ...input, action: "undo", version: 3, repository: store });
    const queued = mocks.addEvent.mock.calls[0]?.[0];
    expect(queued.title).toBe("Undo the live inquiry form change");
    expect(queued.body).toContain("Undo release 3");
    expect(queued.body).toContain("received inquiries stay kept");
  });

  it("closes the claim when the governed event cannot be persisted", async () => {
    const store = repository();
    mocks.addEvent.mockRejectedValue(new Error("event store unavailable"));

    await expect(queueInquiryPublication({ ...input, repository: store })).rejects.toThrow("event store unavailable");
    expect(store.markPublicationFailed).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "acme",
      claimId: "claim-1",
      claimToken: "server-only-claim-token",
      reason: "governance_event_unavailable",
    }));
  });

  it("does not create another event for an existing publication claim", async () => {
    const store = repository();
    vi.mocked(store.claimPublication).mockResolvedValue({ acquired: false, claim, reason: "already_claimed" });

    const result = await queueInquiryPublication({ ...input, repository: store });

    expect(result).toMatchObject({ acquired: false, reason: "already_claimed", eventId: null });
    expect(mocks.addEvent).not.toHaveBeenCalled();
  });
});
