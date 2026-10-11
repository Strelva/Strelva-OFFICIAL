import { afterEach, describe, expect, it, vi } from "vitest";
import { createInquiryFormAdapter } from "@/platform/make-real/live-adapters";
import type { DeclaredEffect } from "@/platform/possibilities/contracts";
import { authorizeInquiryPublicationActor } from "@/products/inquiries/publication";
import type { InquiryRepository, PublicationClaim } from "@/products/inquiries/repository";
import type { UnifiedEvent } from "@/lib/types";
import { tenantEventRevision } from "@/platform/needs-you/tenant-classify";
const owner = "f6350000-0000-4000-8000-000000000001";
const claim: PublicationClaim = { id: "f6350000-0000-4000-8000-000000000002", tenantId: "fixture", tenantStableId: null, businessId: "business", requestId: "request", capabilityId: "form", changeId: "change", action: "make_live", version: 2, idempotencyKey: "publish", commandDigest: "a".repeat(64), status: "claimed", acceptanceId: null, providerReceipt: null, failureReason: null, actorId: owner, governanceEventId: "event", createdAt: "2026-10-10T12:00:00Z", acceptedAt: null, updatedAt: "2026-10-10T12:00:00Z" };
const event: UnifiedEvent = { id: "event", tenantId: "fixture", source: "website", type: "change_request", title: "Make the form live", body: "Exact published form", status: "pending", createdAt: claim.createdAt, metadata: { kind: "inquiry_capability_publish", publicationClaimId: claim.id, businessId: claim.businessId, requestId: claim.requestId, capabilityId: claim.capabilityId, changeId: claim.changeId, version: claim.version } };
function input(actorId: string) {
  const repository = { getPublicationClaim: vi.fn(async () => claim) } as unknown as InquiryRepository;
  const authorizationRpc = vi.fn(async () => true);
  return { tenantId: "fixture", eventId: event.id, claimId: claim.id, event, actorId, repository, authorizationRpc };
}
afterEach(() => vi.unstubAllEnvs());
describe("exact current owner publication authority", () => {
  it("Make Real passes its current execution actor into the exact publication authority check", async () => {
    const authorized = input(owner);
    const execute = vi.fn(async (command: { tenantId: string; eventId: string; claimId: string; actorId: string }) => {
      const permission = await authorizeInquiryPublicationActor({ ...authorized, ...command });
      return { accepted: permission.allowed, verified: permission.allowed, reason: permission.reason };
    });
    const queue = vi.fn(async () => ({ claim, acquired: true, eventId: event.id }));
    const adapter = createInquiryFormAdapter({ queue, execute, claim: async () => claim },
      { actor: { userId: owner, verifiedEmail: "owner@example.test" }, enabled: async () => true });
    const effect: DeclaredEffect = { id: "publish-form", kind: "publish", channel: "inquiry_form",
      system: { systemId: "f6350000-0000-4000-8000-000000000003" }, description: "Publish the reviewed native form", after: [],
      request: { tenantId: claim.tenantId, businessId: claim.businessId, requestId: claim.requestId,
        capabilityId: claim.capabilityId, changeId: claim.changeId, version: claim.version } };
    expect(await adapter.perform({ businessId: claim.businessId, effect, idempotencyKey: "actor-propagation" })).toMatchObject({ status: "accepted" });
    expect(execute).toHaveBeenCalledWith({ tenantId: claim.tenantId, eventId: event.id, claimId: claim.id, actorId: owner });
    expect(authorized.authorizationRpc).toHaveBeenCalledWith("authorize_inquiry_publication_actor", {
      p_tenant_id: claim.tenantId, p_actor_id: owner, p_claim_id: claim.id, p_event_id: event.id,
    });
    // Propagating an actor does not replace the current database authority check.
    authorized.authorizationRpc.mockResolvedValue(false);
    expect(await adapter.perform({ businessId: claim.businessId, effect, idempotencyKey: "withdrawn" })).toMatchObject({ status: "rejected", reason: "permission_denied" });
    execute.mockClear();
    expect(await adapter.perform({ businessId: claim.businessId,
      effect: { ...effect, request: { ...effect.request, actorId: "f6350000-0000-4000-8000-000000000099" } },
      idempotencyKey: "forged-request-actor" })).toMatchObject({ status: "rejected" });
    expect(execute).not.toHaveBeenCalled();
  });
  it("an omitted execution actor remains denied before current authority or publication", async () => {
    const authorized = input(owner);
    expect(await authorizeInquiryPublicationActor({ ...authorized, actorId: undefined })).toEqual({ allowed: false, reason: "permission_denied" });
    expect(authorized.authorizationRpc).not.toHaveBeenCalled();
  });
  it("requires the claim's direct owner and a current bounded database authorization", async () => {
    const authorized = input(owner);
    expect(await authorizeInquiryPublicationActor(authorized)).toEqual({ allowed: true });
    expect(authorized.authorizationRpc).toHaveBeenCalledWith("authorize_inquiry_publication_actor", { p_tenant_id: "fixture", p_actor_id: owner, p_claim_id: claim.id, p_event_id: "event" });
    authorized.authorizationRpc.mockResolvedValue(false);
    expect(await authorizeInquiryPublicationActor(authorized)).toEqual({ allowed: false, reason: "permission_denied" });
    const operator = input("f6350000-0000-4000-8000-000000000099");
    expect(await authorizeInquiryPublicationActor(operator)).toEqual({ allowed: false, reason: "permission_denied" });
    expect(operator.authorizationRpc).not.toHaveBeenCalled();
  });
  it("a signed link requires the current accepted owner decision for the exact event revision and action", async () => {
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "1"); vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1"); vi.stubEnv("DUAL_WRITE_PG", "1");
    const signed = input("owner-link:unclaimed@example.test");
    expect(await authorizeInquiryPublicationActor(signed)).toEqual({ allowed: true });
    expect(signed.authorizationRpc).toHaveBeenCalledWith("authorize_inquiry_owner_link_publication", { p_tenant_id: "fixture", p_event_id: "event", p_revision: tenantEventRevision(event), p_recipient: "unclaimed@example.test", p_claim_id: claim.id, p_action: "approved" });
    expect(await authorizeInquiryPublicationActor({ ...signed, action: "dismissed" })).toEqual({ allowed: true });
    expect(signed.authorizationRpc).toHaveBeenLastCalledWith("authorize_inquiry_owner_link_publication", expect.objectContaining({ p_action: "dismissed" }));
    signed.authorizationRpc.mockResolvedValue(false);
    expect((await authorizeInquiryPublicationActor(signed)).allowed).toBe(false);
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "0"); signed.authorizationRpc.mockClear();
    expect((await authorizeInquiryPublicationActor(signed)).allowed).toBe(false); expect(signed.authorizationRpc).not.toHaveBeenCalled();
  });
  it("foreign, changed or forged event payloads never reach authority or publication", async () => {
    const authorized = input(owner);
    expect((await authorizeInquiryPublicationActor({ ...authorized, event: { ...event, tenantId: "other" } })).allowed).toBe(false);
    expect((await authorizeInquiryPublicationActor({ ...authorized, event: { ...event, metadata: { ...event.metadata, version: 3 } } })).allowed).toBe(false);
    expect((await authorizeInquiryPublicationActor({ ...authorized, event: { ...event, metadata: { ...event.metadata, publicationClaimId: "other" } } })).allowed).toBe(false);
    expect(authorized.authorizationRpc).not.toHaveBeenCalled();
  });
});
