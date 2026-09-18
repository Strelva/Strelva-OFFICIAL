import { describe, expect, it } from "vitest";
import {
  OfferingAccessError,
  OfferingConflictError,
  ProviderDeliveryService,
  type OfferingActor,
  type OfferingInstallation,
  type ProviderAssignmentGateway,
  type ProviderDelivery,
  type ProviderDeliveryStore,
  type ProviderOfferingGateway,
} from "@/platform/offerings";
import type { OperationalAssignment } from "@/platform/work-participation";

const BUSINESS = "10000000-0000-4000-8000-000000000001";
const INSTALLATION = "10000000-0000-4000-8000-000000000002";
const ASSIGNMENT = "10000000-0000-4000-8000-000000000003";
const DELIVERY = "10000000-0000-4000-8000-000000000004";
const APPLICATION = "10000000-0000-4000-8000-000000000009";
const OWNER_ID = "10000000-0000-4000-8000-000000000005";
const PROVIDER_ID = "10000000-0000-4000-8000-000000000006";
const OTHER_ID = "10000000-0000-4000-8000-000000000007";
const at = "2026-09-18T12:00:00.000Z";
const expiresAt = "2026-09-20T12:00:00.000Z";

const owner: OfferingActor = { userId: OWNER_ID, verifiedEmail: "owner@example.test" };
const provider: OfferingActor = { userId: PROVIDER_ID, verifiedEmail: "staff@strelva.test" };
const other: OfferingActor = { userId: OTHER_ID, verifiedEmail: "other@example.test" };

function installation(responsibility: OfferingInstallation["responsibility"] = {
  kind: "provider_requested", providerKind: "strelva", providerName: "Strelva", requestNote: "Set up the exact approved workflow.",
}): OfferingInstallation {
  return {
    id: INSTALLATION, businessId: BUSINESS, definitionId: "private_staff_requests", definitionVersion: "1.0.0",
    status: "active", revision: 2, configuration: {}, nativeResources: [{ kind: "application", id: APPLICATION }], responsibility,
    acceptedScope: ["submit_requests", "review_requests"], installedBy: OWNER_ID, installedAt: at,
    updatedBy: OWNER_ID, updatedAt: at, surfaces: [],
  };
}

function assignment(status: OperationalAssignment["status"] = "offered"): OperationalAssignment {
  return {
    id: ASSIGNMENT, workspaceId: BUSINESS, workId: "10000000-0000-4000-8000-000000000008",
    sponsorId: OWNER_ID, sponsorEmail: owner.verifiedEmail, assigneeUserId: PROVIDER_ID,
    assigneeEmail: provider.verifiedEmail, assigneeKind: "strelva", scope: ["operate"], status,
    offeredAt: at, expiresAt, acceptedAt: status === "accepted" ? at : null,
    revokedAt: status === "revoked" ? at : null, revokedBy: status === "revoked" ? OWNER_ID : null,
  };
}

class MemoryStore implements ProviderDeliveryStore {
  current: ProviderDelivery | null = null;
  failNextAccept = false;
  afterRevoke: (() => void) | null = null;
  async list() { return this.current ? [structuredClone(this.current)] : []; }
  async read(actor: OfferingActor) {
    if (!this.current || ![OWNER_ID, PROVIDER_ID].includes(actor.userId)) throw new OfferingAccessError();
    return structuredClone(this.current);
  }
  async request(actor: OfferingActor, input: { businessId: string; installationId: string; assignmentId: string; idempotencyKey: string; commandDigest: string }) {
    if (this.current) {
      if (this.current.businessId !== input.businessId || this.current.installationId !== input.installationId || this.current.assignmentId !== input.assignmentId) throw new OfferingConflictError();
      return structuredClone(this.current);
    }
    this.current = {
      id: DELIVERY, businessId: input.businessId, installationId: input.installationId, assignmentId: input.assignmentId,
      status: "requested", customerDecision: "pending", revision: 1, scope: ["submit_requests", "review_requests"],
      requestedBy: actor.userId, requestedAt: at, expiresAt, acceptedBy: null, acceptedAt: null,
      revokedBy: null, revokedAt: null, revocationReason: null, decidedBy: null, decidedAt: null, decisionNote: null,
      history: [{ kind: "requested", actorId: actor.userId, at, note: null }],
    };
    return structuredClone(this.current);
  }
  async accept(actor: OfferingActor) {
    if (!this.current) throw new Error("missing");
    if (this.current.status === "accepted") return structuredClone(this.current);
    if (this.failNextAccept) { this.failNextAccept = false; throw new Error("delivery receipt unavailable"); }
    this.current = { ...this.current, status: "accepted", revision: this.current.revision + 1, acceptedBy: actor.userId, acceptedAt: at,
      history: [...this.current.history, { kind: "accepted", actorId: actor.userId, at, note: null }] };
    return structuredClone(this.current);
  }
  async revoke(actor: OfferingActor, _id: string, expectedRevision: number, reason: string) {
    if (!this.current || this.current.revision !== expectedRevision) throw new OfferingConflictError();
    this.current = { ...this.current, status: "revoked", revision: this.current.revision + 1, revokedBy: actor.userId,
      revokedAt: at, revocationReason: reason, history: [...this.current.history, { kind: "revoked", actorId: actor.userId, at, note: reason }] };
    this.afterRevoke?.();
    return structuredClone(this.current);
  }
  async decide(actor: OfferingActor, _id: string, expectedRevision: number, decision: "confirmed" | "changes_requested", note: string) {
    if (!this.current || this.current.revision !== expectedRevision) throw new OfferingConflictError();
    this.current = { ...this.current, customerDecision: decision, revision: this.current.revision + 1, decidedBy: actor.userId,
      decidedAt: at, decisionNote: note, history: [...this.current.history, { kind: decision, actorId: actor.userId, at, note }] };
    return structuredClone(this.current);
  }
}

function harness() {
  const store = new MemoryStore();
  let app = installation();
  let assigned = assignment();
  let workStatus = "ready";
  const offerings: ProviderOfferingGateway = {
    async read(_actor, businessId, installationId) {
      if (businessId !== BUSINESS || installationId !== INSTALLATION) throw new OfferingAccessError();
      return structuredClone(app);
    },
    async canManage(actor) { return actor.userId === OWNER_ID; },
  };
  const assignments: ProviderAssignmentGateway = {
    async inspect(actor, assignmentId) {
      if (assignmentId !== ASSIGNMENT || ![OWNER_ID, PROVIDER_ID].includes(actor.userId)) throw new OfferingAccessError();
      return { assignment: structuredClone(assigned), responsibility: { workspaceId: BUSINESS, payload: { status: workStatus, steps: [{ workId: APPLICATION }] } } };
    },
    async accept(actor, assignmentId) {
      if (actor.userId !== PROVIDER_ID || assignmentId !== ASSIGNMENT || assigned.status === "revoked") throw new OfferingAccessError();
      assigned = assignment("accepted");
      return structuredClone(assigned);
    },
    async revoke(actor, assignmentId) {
      if (actor.userId !== OWNER_ID || assignmentId !== ASSIGNMENT) throw new OfferingAccessError();
      assigned = assignment("revoked");
      return structuredClone(assigned);
    },
  };
  store.afterRevoke = () => { assigned = assignment("revoked"); };
  return {
    store, service: new ProviderDeliveryService(store, offerings, assignments),
    setInstallation(next: OfferingInstallation) { app = next; },
    setAssignment(next: OperationalAssignment) { assigned = next; },
    complete() { workStatus = "completed"; },
  };
}

const request = { action: "request", businessId: BUSINESS, installationId: INSTALLATION, assignmentId: ASSIGNMENT, idempotencyKey: "delivery:first" } as const;

describe("offering provider delivery", () => {
  it("keeps a customer request pending until the exact Strelva assignee accepts", async () => {
    const test = harness();
    const first = await test.service.execute(owner, request);
    expect(first).toMatchObject({ status: "requested", customerDecision: "pending", requestedBy: OWNER_ID, acceptedBy: null });
    const retry = await test.service.execute(owner, request);
    expect(retry.id).toBe(first.id);
    await expect(test.service.execute(owner, { action: "accept", deliveryId: first.id })).rejects.toBeInstanceOf(OfferingAccessError);
    await expect(test.service.execute(other, { action: "accept", deliveryId: first.id })).rejects.toBeInstanceOf(OfferingAccessError);
    const accepted = await test.service.execute(provider, { action: "accept", deliveryId: first.id });
    expect(accepted).toMatchObject({ status: "accepted", acceptedBy: PROVIDER_ID, customerDecision: "pending" });
    expect(accepted.history.map((event) => event.kind)).toEqual(["requested", "accepted"]);
    expect((await test.service.execute(provider, { action: "accept", deliveryId: first.id })).id).toBe(first.id);
  });

  it("recovers when assignment acceptance commits before the delivery receipt", async () => {
    const test = harness();
    const requested = await test.service.execute(owner, request);
    test.store.failNextAccept = true;
    await expect(test.service.execute(provider, { action: "accept", deliveryId: requested.id })).rejects.toThrow(/receipt unavailable/);
    const recovered = await test.service.execute(provider, { action: "accept", deliveryId: requested.id });
    expect(recovered).toMatchObject({ id: requested.id, status: "accepted", acceptedBy: PROVIDER_ID });
    expect(recovered.history.filter((event) => event.kind === "accepted")).toHaveLength(1);
  });

  it("rejects customer-operated, third-party, inactive, foreign, and non-Strelva assignment requests", async () => {
    const test = harness();
    for (const responsibility of [
      { kind: "customer_operated", providerName: "Example business" } as const,
      { kind: "provider_requested", providerKind: "named_third_party", providerName: "Other provider" } as const,
    ]) {
      test.setInstallation(installation(responsibility));
      await expect(test.service.execute(owner, request)).rejects.toBeInstanceOf(OfferingConflictError);
    }
    test.setInstallation({ ...installation(), status: "draft" });
    await expect(test.service.execute(owner, request)).rejects.toBeInstanceOf(OfferingConflictError);
    test.setInstallation(installation());
    test.setAssignment({ ...assignment(), workspaceId: "20000000-0000-4000-8000-000000000001" });
    await expect(test.service.execute(owner, request)).rejects.toBeInstanceOf(OfferingConflictError);
    test.setAssignment({ ...assignment(), assigneeKind: "agency" });
    await expect(test.service.execute(owner, request)).rejects.toBeInstanceOf(OfferingConflictError);
    test.setAssignment(assignment());
    test.setInstallation({ ...installation(), nativeResources: [{ kind: "application", id: "20000000-0000-4000-8000-000000000002" }] });
    await expect(test.service.execute(owner, request)).rejects.toThrow(/exact installed resource/i);
  });

  it("rejects a stale revoke without touching assignment authority and preserves accepted history", async () => {
    const test = harness();
    const requested = await test.service.execute(owner, request);
    const accepted = await test.service.execute(provider, { action: "accept", deliveryId: requested.id });
    await expect(test.service.execute(owner, { action: "revoke", deliveryId: accepted.id, expectedRevision: accepted.revision - 1, reason: "Stale screen." })).rejects.toBeInstanceOf(OfferingConflictError);
    const revoked = await test.service.execute(owner, { action: "revoke", deliveryId: accepted.id, expectedRevision: accepted.revision, reason: "Customer stopped delivery." });
    expect(revoked).toMatchObject({ status: "revoked", revocationReason: "Customer stopped delivery." });
    expect(revoked.history.map((event) => event.kind)).toEqual(["requested", "accepted", "revoked"]);
    await expect(test.service.execute(provider, { action: "accept", deliveryId: requested.id })).rejects.toBeInstanceOf(OfferingAccessError);
  });

  it("keeps customer confirmation separate and requires completed assigned work", async () => {
    const test = harness();
    const requested = await test.service.execute(owner, request);
    const accepted = await test.service.execute(provider, { action: "accept", deliveryId: requested.id });
    await expect(test.service.execute(owner, { action: "decide", deliveryId: accepted.id, expectedRevision: accepted.revision, decision: "confirmed", note: "The workflow is in use." })).rejects.toBeInstanceOf(OfferingConflictError);
    test.complete();
    const confirmed = await test.service.execute(owner, { action: "decide", deliveryId: accepted.id, expectedRevision: accepted.revision, decision: "confirmed", note: "The workflow is in use." });
    expect(confirmed).toMatchObject({ status: "accepted", customerDecision: "confirmed", decisionNote: "The workflow is in use." });
    expect(confirmed.history.map((event) => event.kind)).toEqual(["requested", "accepted", "confirmed"]);
  });
});
