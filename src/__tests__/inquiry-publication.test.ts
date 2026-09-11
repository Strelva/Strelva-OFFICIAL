import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import { executeInquiryPublication } from "@/products/inquiries/publication";
import { InMemoryInquiryRepository, publicationClaimToken } from "@/products/inquiries/repository";
import { recordInquiryEvidence } from "@/products/inquiries/receive";

async function prepared() {
  const repository = new InMemoryInquiryRepository();
  const engine = new InquiryEngine({ businessId: "business-one" });
  const work = engine.start({ actorId: "owner-one", intent: "Collect seller inquiries", destination: "owner@example.invalid", emailConnection: { status: "connected", consent: "explicit", lastCheckedAt: "2026-09-11T14:00:00Z" } });
  engine.acceptShape(work.id, { actorId: "owner-one" });
  engine.runRehearsal(work.id);
  engine.approvePublish(work.id, { actorId: "owner-one" });
  const ready = engine.getWork(work.id);
  await repository.compareAndSwap({ tenantId: "tenant-one", businessId: "business-one", expectedRevision: null, state: engine.snapshot() });
  const reserved = await repository.claimPublication({ tenantId: "tenant-one", businessId: "business-one", requestId: work.id, capabilityId: work.capabilityId, changeId: ready.activeChangeId!, action: "make_live", version: ready.draft!.version, idempotencyKey: "first-publication", actorId: "owner-one" });
  if (!reserved.acquired) throw new Error("Fixture claim was not acquired");
  await repository.linkPublicationEvent({ tenantId: "tenant-one", claimId: reserved.claim.id, claimToken: reserved.claimToken, governanceEventId: "event-one" });
  return { repository, work: ready, claim: reserved.claim, input: { tenantId: "tenant-one", eventId: "event-one", claimId: reserved.claim.id, repository } };
}

describe("governed inquiry publication transaction", () => {
  beforeEach(() => vi.stubEnv("STRELVA_INQUIRIES_RELEASE", "1"));
  afterEach(() => vi.unstubAllEnvs());

  it("commits the public definition and its receipt, verifies it and never repeats the command", async () => {
    const { input, repository, work, claim } = await prepared();
    expect(await executeInquiryPublication(input)).toEqual({ accepted: true, verified: true });
    const snapshot = await repository.getSnapshot(input.tenantId, claim.businessId);
    expect(snapshot?.state.capabilities[0]?.status).toBe("live");
    expect(snapshot?.state.capabilities[0]?.live).toEqual(work.draft);
    expect(snapshot?.state.changes[0]?.verification?.verified).toBe(true);
    const commit = vi.spyOn(repository, "compareAndSwap");
    expect(await executeInquiryPublication(input)).toEqual({ accepted: true, verified: true });
    expect(commit).not.toHaveBeenCalled();
  });

  it("rejects foreign event identity and stale draft approval before writing", async () => {
    const { input, repository, claim } = await prepared();
    const commit = vi.spyOn(repository, "compareAndSwap");
    expect((await executeInquiryPublication({ ...input, eventId: "foreign-event" })).accepted).toBe(false);
    expect((await executeInquiryPublication({ ...input, tenantId: "other-tenant" })).accepted).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    const saved = await repository.getSnapshot(input.tenantId, claim.businessId);
    const changed = new InquiryEngine({ businessId: claim.businessId, state: saved!.state });
    changed.applyDraftEdit(claim.requestId, { actorId: "owner-one", path: "form.title", source: "manual", after: "A later edit" });
    await repository.compareAndSwap({ tenantId: input.tenantId, businessId: claim.businessId, expectedRevision: saved!.revision, state: changed.snapshot() });
    commit.mockClear();
    expect((await executeInquiryPublication(input)).reason).toBe("publication_approval_is_stale");
    expect(commit).not.toHaveBeenCalled();
  });

  it("recovers a lost database response from the persisted acceptance receipt", async () => {
    const { input, repository } = await prepared();
    const original = repository.compareAndSwap.bind(repository);
    vi.spyOn(repository, "compareAndSwap").mockImplementationOnce(async (command) => {
      await original(command);
      throw new Error("Connection lost after commit");
    });
    expect(await executeInquiryPublication(input)).toEqual({ accepted: true, verified: true });
  });

  it("never repeats a claim already marked accepted when its state receipt is missing", async () => {
    const { input, repository, claim } = await prepared();
    await repository.markPublicationAccepted({
      tenantId: input.tenantId,
      claimId: claim.id,
      claimToken: publicationClaimToken(claim),
      acceptanceId: `inquiry-postgres:${claim.id}`,
      providerReceipt: { target: "Postgres public inquiry configuration" },
    });
    const commit = vi.spyOn(repository, "compareAndSwap");

    expect(await executeInquiryPublication(input)).toEqual({
      accepted: true,
      verified: false,
      reason: "accepted_configuration_requires_reconciliation",
    });
    expect(commit).not.toHaveBeenCalled();
    expect((await repository.getSnapshot(input.tenantId, claim.businessId))?.state.capabilities[0]?.live).toBeNull();
  });

  it("keeps publication accepted when recording verification fails", async () => {
    const { input, repository, claim } = await prepared();
    const original = repository.compareAndSwap.bind(repository);
    vi.spyOn(repository, "compareAndSwap").mockImplementationOnce(original).mockRejectedValueOnce(new Error("Verification receipt unavailable"));
    expect(await executeInquiryPublication(input)).toEqual({ accepted: true, verified: false, reason: "publication_verification_pending" });
    expect((await repository.getPublicationClaim(input.tenantId, claim.id))?.status).toBe("verification_failed");
    expect((await repository.getSnapshot(input.tenantId, claim.businessId))?.state.capabilities[0]?.live).not.toBeNull();
    expect(await executeInquiryPublication(input)).toEqual({ accepted: true, verified: true });
  });

  it("undoes the configuration through a separate explicit claim", async () => {
    const { input, repository, claim } = await prepared();
    await executeInquiryPublication(input);
    const received = await recordInquiryEvidence({ tenantId: input.tenantId, businessId: claim.businessId, inquiryId: "incoming-after-publication", capabilityId: claim.capabilityId, expectedCapabilityVersion: claim.version, fields: { name: "Pretend buyer", email: "buyer@example.invalid", message: "Please contact me." }, receivedAt: new Date().toISOString(), repository });
    expect(received.status).toBe("recorded");
    const snapshot = await repository.getSnapshot(input.tenantId, claim.businessId);
    const work = snapshot!.state.requests[0]!;
    const reserved = await repository.claimPublication({ tenantId: input.tenantId, businessId: claim.businessId, requestId: work.id, capabilityId: work.capabilityId, changeId: work.lastLiveChangeId!, action: "undo", version: work.draft!.version + 1, idempotencyKey: "undo-first", actorId: "owner-one" });
    if (!reserved.acquired) throw new Error("Undo fixture claim unavailable");
    await repository.linkPublicationEvent({ tenantId: input.tenantId, claimId: reserved.claim.id, claimToken: publicationClaimToken(reserved.claim), governanceEventId: "undo-event" });
    expect(await executeInquiryPublication({ ...input, claimId: reserved.claim.id, eventId: "undo-event" })).toEqual({ accepted: true, verified: true });
    expect((await repository.getSnapshot(input.tenantId, claim.businessId))?.state.capabilities[0]?.live).toBeNull();
    const undone = await repository.getSnapshot(input.tenantId, claim.businessId);
    expect(undone?.state.timeline.some((event) => event.inquiryId === "incoming-after-publication")).toBe(true);
    expect(undone?.state.changes[0]?.preservedInquiryIds).toContain("incoming-after-publication");
  });
});
