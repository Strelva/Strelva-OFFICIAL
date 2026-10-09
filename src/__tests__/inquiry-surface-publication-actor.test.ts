import { beforeEach, expect, it, vi } from "vitest";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import { InMemoryInquiryRepository } from "@/products/inquiries/repository";
import type { TenantConfig, UnifiedEvent } from "@/lib/types";
import { authorizeInquiryPublicationActor } from "@/products/inquiries/publication";

const mocks = vi.hoisted(() => ({ addEvent: vi.fn(), resolve: vi.fn(), authority: vi.fn() }));
vi.mock("@/lib/events", () => ({ addEvent: mocks.addEvent, resolveEvent: vi.fn() }));
vi.mock("@/lib/event-actions", () => ({ resolveEventAction: mocks.resolve }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null }));
vi.mock("@/lib/leads", () => ({ getLeads: async () => [], leadReadStoreReady: async () => true, leadReadSource: async () => "redis" }));
vi.mock("@/platform/infra/auth", () => ({ getTenantRole: async () => "owner", roleHasPermission: () => true }));
vi.mock("@/products/inquiries/workspace-exit", () => ({ assertInquiryWorkspaceOpen: async () => undefined }));
vi.mock("@/platform/business-record/public-reader", () => ({ readReleasedTenantBusinessContext: async () => null }));
vi.mock("@/products/inquiries/business-context", () => ({ readInquiryBusinessContext: async () => null }));

import { executeInquirySurface } from "@/products/inquiries/server";

const owner = "a6350000-0000-4000-8000-000000000001";
const foreign = "a6350000-0000-4000-8000-000000000099";
const tenantId = "actor-propagation";
const businessId = "a6350000-0000-4000-8000-000000000002";
const config = { id: tenantId, siteName: "Native unit fixture", active: true } as TenantConfig;

beforeEach(() => { vi.clearAllMocks(); mocks.authority.mockResolvedValue(true); });

it("the actual surface queues and resolves publication as the authenticated owner, while foreign and revoked actors remain denied", async () => {
  const repository = new InMemoryInquiryRepository();
  const engine = new InquiryEngine({ businessId });
  const work = engine.start({ actorId: owner, intent: "Collect an inquiry without sending messages" });
  engine.acceptShape(work.id, { actorId: owner, selectedLineIds: ["form", "record"] });
  engine.runRehearsal(work.id);
  await repository.compareAndSwap({ tenantId, businessId, expectedRevision: null, state: engine.snapshot(), actorId: owner });
  let event: UnifiedEvent | undefined;
  mocks.addEvent.mockImplementation(async (value: Omit<UnifiedEvent, "id" | "createdAt">) => {
    event = { ...value, id: "surface-publication-event", createdAt: new Date().toISOString() };
    return event;
  });
  mocks.resolve.mockImplementation(async (_tenant: string, _event: string, _action: string, actorId = "user") => {
    const authorization = await authorizeInquiryPublicationActor({ tenantId, eventId: event!.id,
      claimId: String(event!.metadata!.publicationClaimId), event, actorId, repository, authorizationRpc: mocks.authority });
    // This seam test performs no native publication. Its durable draft stays
    // a draft; authorization cannot be mistaken for a live receipt.
    return { changed: false, reason: authorization.allowed ? "native_publication_not_executed_in_unit" : authorization.reason };
  });
  const result = await executeInquirySurface({ context: { tenantId, businessId, config, repository },
    action: { kind: "publish", requestId: work.id }, expectedRevision: 1, actorId: owner });
  expect(mocks.resolve).toHaveBeenCalledWith(tenantId, event!.id, "approved", owner);
  expect(mocks.authority).toHaveBeenCalledWith("authorize_inquiry_publication_actor", {
    p_tenant_id: tenantId, p_actor_id: owner, p_claim_id: String(event!.metadata!.publicationClaimId), p_event_id: event!.id,
  });
  expect(result.snapshot.state.requests[0]!.publishApproval?.actorId).toBe(owner);
  expect(result.snapshot.state.capabilities[0]!.live).toBeNull();
  expect(result.message).toContain("native_publication_not_executed_in_unit");
  const bound = { tenantId, eventId: event!.id, claimId: String(event!.metadata!.publicationClaimId), event, repository, authorizationRpc: mocks.authority };
  mocks.authority.mockClear();
  expect(await authorizeInquiryPublicationActor({ ...bound, actorId: foreign })).toEqual({ allowed: false, reason: "permission_denied" });
  expect(mocks.authority).not.toHaveBeenCalled();
  mocks.authority.mockResolvedValue(false);
  expect(await authorizeInquiryPublicationActor({ ...bound, actorId: owner })).toEqual({ allowed: false, reason: "permission_denied" });
  expect(mocks.authority).toHaveBeenCalledWith("authorize_inquiry_publication_actor", expect.objectContaining({ p_actor_id: owner }));
  expect((await repository.getSnapshot(tenantId, businessId))!.state.capabilities[0]!.live).toBeNull();
});
