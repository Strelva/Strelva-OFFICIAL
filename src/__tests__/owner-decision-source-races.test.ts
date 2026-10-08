import { describe, expect, it, vi } from "vitest";
import { serviceRequestAdapter, type SourceAdapter } from "@/platform/needs-you/adapters";
import { createNeedsYouService } from "@/platform/needs-you/service";
import type { ServiceSession } from "@/platform/needs-you/service-actor";
import { providerDeliveryAdapter } from "@/platform/needs-you/sources/provider-delivery";
import { standingResponsibilityAdapter } from "@/platform/needs-you/sources/standing-responsibility";
import { workResponsibilityAdapter } from "@/platform/needs-you/sources/work-responsibility";
import { workPlanAdapter, type WorkPlanView } from "@/platform/needs-you/sources/work-plan";
import type { ServiceRequest } from "@/platform/service-requests/types";
import type { ProviderDelivery } from "@/platform/offerings/provider-delivery";
import { createStandingResponsibility } from "@/platform/work-execution/standing";
import { createResponsibility } from "@/platform/work-execution/engine";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { needsYouMemoryStore } from "./support/needs-you-memory";

const WS = "b3000000-0000-4000-8000-000000000001";
const WORK = "b3000000-0000-4000-8000-000000000002";
const ADMIN: WorkspaceActor = { userId: "b3000000-0000-4000-8000-000000000003", verifiedEmail: "operator@example.test" };
const OWNER_EMAIL = "account-free-owner@example.test";
const AT = "2026-10-07T14:00:00.000Z";
const STEP = { id: "check", operation: "investigation.run", workId: WORK, input: {}, maximumCents: 0 };

function requestFixture() {
  const row: ServiceRequest = {
    id: WORK, businessId: WS, status: "requested", request: "Repair the contact form", outcome: "Visitors can contact us",
    context: {}, scope: ["contact form"], provider: { kind: "strelva" },
    providerAcceptance: { status: "accepted", actorId: ADMIN.userId, acceptedAt: AT, note: null }, installationId: null, deliveryId: null,
    deliveryCommitment: { version: 1, status: "proposed", operatorId: ADMIN.userId, termsReference: "Existing terms",
      deliveryDefinition: "A working contact form", scope: ["contact form"], proposedAt: AT, startedAt: null, dueAt: null,
      customerAcceptedBy: null, customerAcceptedAt: null, blocker: null, result: null, decision: null },
    revision: 1, createdBy: ADMIN.userId, createdAt: AT, updatedAt: AT,
  };
  const write = vi.fn(async (_actor: WorkspaceActor) => ({ ...row, revision: row.revision + 1 }));
  const adapter = serviceRequestAdapter({ list: async () => [row], change: write });
  return { adapter, write, changeSource: () => { row.revision += 1; row.deliveryCommitment!.scope = ["contact form", "new booking page"]; } };
}

function providerFixture() {
  const row: ProviderDelivery = {
    id: WORK, businessId: WS, installationId: WORK, assignmentId: WORK, status: "accepted", customerDecision: "pending", revision: 1,
    scope: ["contact form"], requestedBy: ADMIN.userId, requestedAt: AT, expiresAt: "2026-11-01T00:00:00.000Z",
    acceptedBy: ADMIN.userId, acceptedAt: AT, revokedBy: null, revokedAt: null, revocationReason: null,
    decidedBy: null, decidedAt: null, decisionNote: null, history: [],
  };
  const write = vi.fn(async (_actor: WorkspaceActor) => ({ ...row, customerDecision: "confirmed" as const, revision: row.revision + 1 }));
  const adapter = providerDeliveryAdapter({ list: async () => [row], workCompleted: async () => true, confirm: write });
  return { adapter, write, changeSource: () => { row.revision += 1; row.scope = ["new booking page"]; } };
}

function standingFixture() {
  const row = { id: WORK, workspaceId: WS, policy: createStandingResponsibility({
    title: "Check the contact form", intent: "Check weekly", scope: { steps: [STEP] }, trigger: { kind: "manual" },
  }, ADMIN.userId, AT) };
  const write = vi.fn(async (_actor: WorkspaceActor) => ({ ...row, policy: { ...row.policy, status: "active" as const } }));
  const adapter = standingResponsibilityAdapter({ list: async () => [row], approve: write });
  return { adapter, write, changeSource: () => { row.policy.revision += 1; row.policy.intent = "Check daily instead"; } };
}

function responsibilityFixture() {
  const row = { id: WORK, workspaceId: WS, payload: createResponsibility({
    title: "Check the contact form", intent: "Check the saved record", steps: [STEP],
  }, ADMIN.userId, AT) };
  const write = vi.fn(async (_actor: WorkspaceActor) => ({ ...row, payload: { ...row.payload, approvedAt: AT, revision: row.payload.revision + 1 } }));
  const adapter = workResponsibilityAdapter({ list: async () => [row], approve: write });
  return { adapter, write, changeSource: () => { row.payload.revision += 1; row.payload.intent = "Check another record instead"; } };
}

function planFixture() {
  const row: WorkPlanView = {
    workId: WORK, workspaceId: WS, status: "ready", userGoal: "Track contact requests", revision: 1,
    requiredDecisions: [], hasRequiredInputs: false, outputs: [{ id: "tracker", title: "Contact tracker", description: "Track contact requests", hasDraft: true }],
    executedOutputIds: [],
  };
  const write = vi.fn(async (_actor: WorkspaceActor) => ({ status: "completed" as const, nativeWorkId: WORK }));
  const adapter = workPlanAdapter({ list: async () => [row], read: async () => row, execute: write });
  return { adapter, write, changeSource: () => { row.revision += 1; row.outputs[0]!.description = "Track bookings instead"; } };
}

async function accountFreeService(adapter: SourceAdapter, afterClaim: () => void = () => {}) {
  const mem = needsYouMemoryStore({ clock: { now: Date.parse(AT) }, roles: { [ADMIN.userId]: "admin" } });
  const sessionId = "b3000000-0000-4000-8000-000000000004";
  const start = vi.fn(async (workspaceId: string, decisionId: string, revisionHash: string, recipient: string): Promise<ServiceSession> => ({
    kind: "strelva_system", label: "Strelva (system)", purpose: "owner_decision_link", sessionId,
    workspaceId, decisionId, revisionHash, recipient, onBehalf: { role: "admin" }, actor: ADMIN,
  }));
  mem.store.ownerLinkSession = start;
  const authorize = vi.fn(async () => { afterClaim(); });
  mem.store.authorizeOwnerLinkRun = authorize;
  const send = vi.fn();
  const service = createNeedsYouService({ store: mem.store, adapters: [adapter], sendEmail: send, appOrigin: "https://app.example.test", now: () => Date.parse(AT) });
  const [item] = (await service.list(ADMIN, WS)).items;
  expect(item).toBeDefined();
  const decide = (decision: "approve" | "not_yet" = "approve") => service.decide({
    workspaceId: WS, itemId: item!.id, revision: item!.revisionHash, decision, by: { kind: "owner_link", recipient: OWNER_EMAIL },
  });
  return { service, item: item!, start, authorize, send, decide };
}

const cases = [
  ["service_request", requestFixture],
  ["provider_delivery", providerFixture],
  ["standing_responsibility", standingFixture],
  ["work_responsibility", responsibilityFixture],
  ["work_plan", planFixture],
] as const;

describe.each(cases)("%s account-free source resolution", (_lifecycle, fixture) => {
  it("refuses a source changed after reconciliation and claim, before the lifecycle write", async () => {
    const source = fixture();
    const current = vi.spyOn(source.adapter, "currentRevision");
    const service = await accountFreeService(source.adapter, source.changeSource);
    const result = await service.decide();
    expect(result).toMatchObject({ status: "failed", item: { outcomeReason: "source_changed", decidedByKind: "owner_link" } });
    // Reconciliation read the old revision; the real source changed only after the claim.
    await expect(current.mock.results.at(-1)?.value).resolves.toBe(service.item.revisionHash);
    expect(service.authorize).toHaveBeenCalledOnce();
    expect(source.write).not.toHaveBeenCalled();
    expect(service.send).not.toHaveBeenCalled();
  });

  it("runs its actual adapter once with the unchanged admin execution identity and owner-link receipt", async () => {
    const source = fixture();
    const service = await accountFreeService(source.adapter);
    expect(await service.decide()).toMatchObject({ status: "done", item: { state: "approved", decidedByKind: "owner_link" } });
    expect(service.start).toHaveBeenCalledWith(WS, service.item.id, service.item.revisionHash, OWNER_EMAIL);
    expect(source.write).toHaveBeenCalledOnce();
    expect(source.write.mock.calls[0]?.[0]).toEqual(ADMIN);
    expect(service.authorize.mock.invocationCallOrder[0]).toBeLessThan(source.write.mock.invocationCallOrder[0]!);
    expect(await service.decide()).toMatchObject({ status: "already_handled" });
    expect(source.write).toHaveBeenCalledOnce();
    expect(service.send).not.toHaveBeenCalled();
  });

  it("declines by owner link without executing the lifecycle", async () => {
    const source = fixture();
    const service = await accountFreeService(source.adapter);
    expect(await service.decide("not_yet")).toMatchObject({ status: "done", item: { state: "declined", decidedByKind: "owner_link" } });
    expect(source.write).not.toHaveBeenCalled();
  });
});
