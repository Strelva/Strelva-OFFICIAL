import { describe, expect, it } from "vitest";
import {
  ServiceRequestService,
  ServiceRequestValidationError,
  type ServiceRequest,
  type ServiceRequestStore,
} from "@/platform/service-requests";

const businessId = "10000000-0000-4000-8000-000000000001";
const requestId = "10000000-0000-4000-8000-000000000002";
const installationId = "10000000-0000-4000-8000-000000000003";
const deliveryId = "10000000-0000-4000-8000-000000000004";
const actor = { userId: "10000000-0000-4000-8000-000000000005", verifiedEmail: "owner@example.test" };

const requested: ServiceRequest = {
  id: requestId,
  businessId,
  status: "requested",
  request: "Have Strelva prepare the staff request flow.",
  outcome: "A usable request form and review path.",
  context: { currentProcess: "email" },
  scope: ["prepare_staff_request_flow"],
  provider: { kind: "strelva" },
  providerAcceptance: { status: "pending", actorId: null, acceptedAt: null, note: null },
  installationId: null,
  deliveryId: null,
  revision: 1,
  createdBy: actor.userId,
  createdAt: "2026-09-19T12:00:00.000Z",
  updatedAt: "2026-09-19T12:00:00.000Z",
};

class MemoryServiceRequestStore implements ServiceRequestStore {
  request = structuredClone(requested);
  lastSave: Record<string, unknown> | null = null;
  lastRespond: Record<string, unknown> | null = null;
  lastLink: Record<string, unknown> | null = null;
  async list() { return [structuredClone(this.request)]; }
  async read() { return structuredClone(this.request); }
  async save(_actor: typeof actor, input: Record<string, unknown>) {
    this.lastSave = input;
    return structuredClone(this.request);
  }
  async respond(_actor: typeof actor, input: Record<string, unknown>) {
    this.lastRespond = input;
    return structuredClone(this.request);
  }
  async linkDelivery(_actor: typeof actor, input: Record<string, unknown>) {
    this.lastLink = input;
    return structuredClone(this.request);
  }
  async withdraw() { return structuredClone(this.request); }
}

describe("service request service", () => {
  it("persists a submitted need with explicit scope/provider and keeps acceptance pending", async () => {
    const store = new MemoryServiceRequestStore();
    const service = new ServiceRequestService(store);

    const result = await service.execute(actor, {
      action: "save",
      businessId,
      status: "requested",
      request: "Have Strelva prepare the staff request flow.",
      outcome: "A usable request form and review path.",
      context: { currentProcess: "email" },
      scope: ["prepare_staff_request_flow"],
      provider: { kind: "strelva" },
      idempotencyKey: "request:one",
    });

    expect(result.status).toBe("requested");
    expect(result.provider).toEqual({ kind: "strelva" });
    expect(result.providerAcceptance.status).toBe("pending");
    expect(store.lastSave).toMatchObject({ businessId, status: "requested", idempotencyKey: "request:one" });
  });

  it("forwards a customer revision without changing the request's explicit fields", async () => {
    const store = new MemoryServiceRequestStore();
    const service = new ServiceRequestService(store);

    await service.execute(actor, {
      action: "save", businessId, requestId, expectedRevision: 1, status: "requested",
      request: "Changed need", outcome: "Changed outcome", context: {}, scope: ["scope"],
      provider: { kind: "strelva" }, idempotencyKey: "request:update",
    });
    expect(store.lastSave).toMatchObject({ requestId, expectedRevision: 1, request: "Changed need", outcome: "Changed outcome", scope: ["scope"] });
  });

  it("forwards explicit provider responses and later delivery linkage as separate commands", async () => {
    const store = new MemoryServiceRequestStore();
    const service = new ServiceRequestService(store);
    await service.execute(actor, { action: "respond", requestId, expectedRevision: 1, decision: "accepted", idempotencyKey: "request:accept" });
    await service.execute(actor, {
      action: "link_delivery", businessId, requestId, installationId, deliveryId,
      expectedRevision: 2, idempotencyKey: "request:link-after-accept",
    });
    expect(store.lastRespond).toMatchObject({ requestId, expectedRevision: 1, decision: "accepted" });
    expect(store.lastLink).toMatchObject({ requestId, installationId, deliveryId, expectedRevision: 2 });
  });

  it("rejects an incomplete provider choice before persistence", async () => {
    const store = new MemoryServiceRequestStore();
    const service = new ServiceRequestService(store);
    await expect(service.execute(actor, {
      action: "save", businessId, status: "requested", request: "Need", outcome: "Result", context: {}, scope: ["scope"],
      provider: { kind: "agency", agencyWorkspaceId: "not-a-uuid" }, idempotencyKey: "request:invalid-provider",
    })).rejects.toBeInstanceOf(ServiceRequestValidationError);
  });

  it("requires the provider to acknowledge the revision it reviewed", async () => {
    const store = new MemoryServiceRequestStore();
    const service = new ServiceRequestService(store);
    await expect(service.execute(actor, {
      action: "respond", requestId, decision: "accepted", idempotencyKey: "request:missing-review-revision",
    })).rejects.toBeInstanceOf(ServiceRequestValidationError);
    expect(store.lastRespond).toBeNull();
  });
});
