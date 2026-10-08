import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LeadRecord } from "@/lib/leads";
import type { UnifiedEvent } from "@/lib/types";
import type { InquiryCapabilityDefinition, InquiryEngineState, ResponsibilityPolicy } from "@/products/inquiries/contracts";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import {
  approveInquiryMessageReviewWithDependencies,
  authorizeInquiryMessageReviewActor,
  executeInquiryMessageReview,
  getInquiryMessageReviewMetadata,
  persistDeliveredInquiryMessageReceipt,
  prepareInquiryMessageReviewWithDependencies,
  reconcileInquiryMessageReview,
  type InquiryMessageReviewDependencies,
} from "@/products/inquiries/delivery-approval-service";
import { createMemoryInquiryDeliveryStore } from "@/products/inquiries/delivery-store";
import { reconcileInquiryProviderEvent } from "@/products/inquiries/reconciliation";
import type { InquiryDeliveryStore, InquiryOutboundTransport } from "@/products/inquiries/delivery-types";
import { createInMemoryInquiryRepository, type InquiryRepository } from "@/products/inquiries/repository";
import { setInquiryRecordsDb } from "@/platform/infra/inquiry-records";
import { tenantEventAdapter, tenantEventItem } from "@/platform/needs-you/adapters";
import { ownerDecisionSchema } from "@/platform/needs-you/contracts";
import { tenantEventRevision } from "@/platform/needs-you/tenant-classify";

vi.mock("@/platform/infra/tenant-crm", () => ({ addTenantActivity: vi.fn(async () => undefined) }));
afterEach(() => { setInquiryRecordsDb(undefined); vi.unstubAllEnvs(); });

const TENANT = "approval-tenant";
const BUSINESS = "approval-business";
const CAPABILITY = "cap_approval";
const INQUIRY = "lead_approval";
const ACTOR = "owner-approval";
const AT = "2026-09-11T12:00:00.000Z";
const RECEIVED_AT = "2026-09-11T10:00:00.000Z";

type Action = "reply" | "owner_notification" | "schedule_follow_up";

function definition(): InquiryCapabilityDefinition {
  return {
    kind: "inquiry" as const,
    id: CAPABILITY,
    businessId: BUSINESS,
    version: 1,
    name: "Approval inquiries",
    form: {
      component: "form" as const,
      id: `${CAPABILITY}:form`,
      title: "Contact us",
      intro: "Tell us what you need.",
      disclosure: "Strelva",
      fields: [
        { id: "name", label: "Name", kind: "text" as const, component: "text_field" as const, required: true },
        { id: "email", label: "Email", kind: "email" as const, component: "email_field" as const, required: true },
      ],
    },
    record: {
      component: "record_detail" as const,
      type: "inquiry" as const,
      singularLabel: "Inquiry",
      pluralLabel: "Inquiries",
      fields: [
        { id: "name", label: "Name", kind: "text" as const, component: "text_field" as const, required: true },
        { id: "email", label: "Email", kind: "email" as const, component: "email_field" as const, required: true },
      ],
    },
    routing: {
      component: "routing_rule" as const,
      id: `${CAPABILITY}:routing`,
      sentence: "Send inquiries to staff@approval.test.",
      channel: "email" as const,
      destination: "staff@approval.test",
      withinMinutes: 5,
    },
    followUp: {
      component: "follow_up_rule" as const,
      id: `${CAPABILITY}:follow-up`,
      sentence: "Check once after one minute.",
      disclosure: "Strelva",
      afterMinutes: 1,
      maxAttempts: 1,
      messageTemplate: "Checking in with you, {name}.",
    },
    connections: [{ id: "email", provider: "email" as const, status: "connected" as const, consent: "explicit" as const, lastCheckedAt: AT }],
    createdAt: AT,
    updatedAt: AT,
  };
}

function responsibility(): ResponsibilityPolicy {
  return {
    id: "responsibility-approval",
    businessId: BUSINESS,
    capabilityId: CAPABILITY,
    title: "Handle inquiry messages",
    scope: "Reply to and route inquiry messages.",
    allowedActions: ["reply", "send_message", "schedule_follow_up"],
    preAuthorizedActions: [],
    never: [],
    approval: [],
    budget: { dailyMessages: 10, timezone: "UTC" },
    escalation: { primary: ACTOR, secondary: null },
    voice: "Clear and warm.",
    hours: { timezone: "UTC", days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" },
    trust: "supervised" as const,
    status: "active" as const,
    sponsorId: ACTOR,
    cleanReceiptCount: 0,
    failedReceiptCount: 0,
    requiredCleanReceipts: 3,
    trustChangedAt: null,
    createdAt: AT,
    updatedAt: AT,
  };
}

function lead(): LeadRecord {
  return {
    id: INQUIRY,
    name: "Ada Rivera",
    email: "ada@example.test",
    message: "Could you tell me more?",
    fields: { name: "Ada Rivera", email: "ada@example.test", message: "Could you tell me more?" },
    capabilityId: CAPABILITY,
    capabilityVersion: 1,
    createdAt: RECEIVED_AT,
  };
}

async function fixture() {
  const seed = new InquiryEngine({ businessId: BUSINESS, now: () => AT });
  const state = seed.snapshot();
  state.capabilities = [{
    id: CAPABILITY,
    businessId: BUSINESS,
    status: "live",
    live: definition(),
    previousLive: null,
    activeRequestId: null,
    updatedAt: AT,
  }];
  state.responsibilities = [responsibility()];

  const repository = createInMemoryInquiryRepository();
  const seeded = await repository.compareAndSwap({
    tenantId: TENANT,
    businessId: BUSINESS,
    expectedRevision: null,
    state,
  });
  expect(seeded.changed).toBe(true);

  const events: UnifiedEvent[] = [];
  const addApprovalEvent: NonNullable<InquiryMessageReviewDependencies["addApprovalEvent"]> = async (input) => {
    const event = {
      ...input,
      id: `event-${events.length + 1}`,
      createdAt: AT,
    } as UnifiedEvent;
    events.unshift(event);
    return event;
  };
  const listEvents: NonNullable<InquiryMessageReviewDependencies["listEvents"]> = async () => events;
  const route = async (inquiry: Parameters<NonNullable<InquiryMessageReviewDependencies["resolveRoute"]>>[0], policy: Parameters<NonNullable<InquiryMessageReviewDependencies["resolveRoute"]>>[1]) => ({
    tenantId: inquiry.tenantId,
    businessName: "Approval business",
    customerEmail: inquiry.email,
    ownerEmail: "staff@approval.test",
    ownerNotification: policy.ownerNotification,
    customerReplyTo: "reply@approval.test",
  });
  const base: InquiryMessageReviewDependencies = {
    repository,
    store: createMemoryInquiryDeliveryStore(),
    now: () => new Date(AT),
    getLead: async () => lead(),
    addApprovalEvent,
    listEvents,
    resolveRoute: route,
    emailReady: async () => true,
    isWorkspaceExited: async () => false,
  };
  return { repository, events, base };
}

async function prepare(action: Action, deps: InquiryMessageReviewDependencies) {
  return prepareInquiryMessageReviewWithDependencies({
    tenantId: TENANT,
    businessId: BUSINESS,
    inquiryId: INQUIRY,
    action,
    actorId: ACTOR,
  }, deps);
}

async function updateState(repository: InquiryRepository, update: (state: InquiryEngineState) => void): Promise<void> {
  const current = await repository.getSnapshot(TENANT, BUSINESS);
  expect(current).not.toBeNull();
  const state = structuredClone(current!.state) as InquiryEngineState;
  update(state);
  const saved = await repository.compareAndSwap({
    tenantId: TENANT,
    businessId: BUSINESS,
    expectedRevision: current!.revision,
    state,
  });
  expect(saved.changed).toBe(true);
}

function transport(verification: "verified" | "unverified" = "verified"): InquiryOutboundTransport {
  return {
    send: vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "provider-approval", acceptedAt: AT })),
    verify: vi.fn(async () => verification === "verified"
      ? { status: "verified" as const, evidence: ["Provider read-back matched the exact message."] }
      : { status: "unverified" as const, reason: "Provider read-back is unavailable.", retryable: false }),
  };
}

describe("signed owner decision through the tenant adapter and inquiry executor", () => {
  it.each(["approved", "unclaimed", "wrong_recipient", "stale_revision", "flags_off"] as const)("uses exact recorded owner authority: %s", async (authorization) => {
    const { base, events, repository } = await fixture();
    await prepare("reply", base);
    const event = events[0]!;
    event.metadata!.reviewAudience = "owner"; // Existing owner-routed draft before the supervised release.
    const revision = tenantEventRevision(event);
    const owner = "owner@example.test";
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", authorization === "flags_off" ? "0" : "1");
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1");
    vi.stubEnv("DUAL_WRITE_PG", "1");
    const authorize = vi.fn(async (name: string, args: Record<string, unknown>) => ({
      data: name === "authorize_inquiry_owner_link_message_action" && authorization !== "unclaimed"
        && args.p_tenant_id === TENANT && args.p_event_id === event.id
        && args.p_revision === (authorization === "stale_revision" ? "b".repeat(64) : revision)
        && args.p_recipient === (authorization === "wrong_recipient" ? "other@example.test" : owner), error: null,
    }));
    setInquiryRecordsDb({ rpc: authorize });
    const mail = transport();
    const adapter = tenantEventAdapter({
      linkedTenants: async () => [TENANT], pendingEvents: async () => events,
      readEvent: async id => events.find(item => item.id === id) ?? null,
      resolveEventAction: async (tenantId, eventId, _action, actorId) => {
        const execution = await executeInquiryMessageReview({ tenantId, eventId, event, actorId, deps: { ...base, transport: mail } });
        return { changed: execution.safeToResolve, ...(execution.verified ? {} : { reason: execution.reason }) };
      },
    });
    const proposed = tenantEventItem(event)!;
    const item = ownerDecisionSchema.parse({
      ...proposed, id: "a0000000-0000-4000-8000-000000000001", workspaceId: "a0000000-0000-4000-8000-000000000002",
      systemId: null, detail: proposed.detail ?? null, openHref: proposed.openHref ?? null,
      signInRequired: false, state: "approved", outcome: null, outcomeReason: null, receiptRef: null,
      decidedByKind: "owner_link", decidedAt: AT, deliveryState: "sent", operatorNote: null,
      openedAt: AT, expiresAt: "2026-09-25T12:00:00Z", reminded1At: null, reminded2At: null, deliveries: [],
    });
    const result = await adapter.resolve({ workspaceId: item.workspaceId }, item, "approve", { kind: "owner_link", recipient: owner, actor: null });
    if (authorization === "approved") {
      expect(result).toEqual({ outcome: "done", receiptRef: `tenant_event:${event.id}` });
      expect(mail.send).toHaveBeenCalledTimes(1);
      expect((await repository.getSnapshot(TENANT, BUSINESS))?.state.responsibilityReceipts).toHaveLength(1);
      expect((await repository.getSnapshot(TENANT, BUSINESS))?.state.responsibilityReceipts[0]).toMatchObject({
        why: "The business owner approved the exact rendered message through a signed decision.",
        outcomeEvidence: expect.arrayContaining(["signed owner decision owner-link:[redacted email]"]),
      });
      expect(authorize).toHaveBeenCalledWith("authorize_inquiry_owner_link_message_action", { p_tenant_id: TENANT, p_event_id: event.id, p_revision: revision, p_recipient: owner, p_action: "approved" });
    } else {
      expect(result).toMatchObject({ outcome: "failed", reason: "permission_denied" });
      expect(mail.send).not.toHaveBeenCalled();
    }
  });
});

describe("signed Not yet message authorization",()=>{
  it("closes exactly the declined owner event while refusing transport approval",async()=>{
    const {base,events}=await fixture(); await prepare("reply",base); const event=events[0]!;
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES","1"); vi.stubEnv("STRELVA_INQUIRY_RECORDS","1"); vi.stubEnv("DUAL_WRITE_PG","1");
    const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>({data:name==="authorize_inquiry_owner_link_message_action" && args.p_action==="dismissed",error:null}));
    setInquiryRecordsDb({rpc});
    const input={tenantId:TENANT,event,actorId:"owner-link:owner@example.test",deps:{...base,emailReady:async()=>false,messageRoute:async()=>"owner_decides" as const}};
    expect(await authorizeInquiryMessageReviewActor({...input,eventAction:"dismissed"})).toEqual({allowed:true});
    expect(await authorizeInquiryMessageReviewActor({...input,eventAction:"approved",deps:{...input.deps,emailReady:async()=>true}})).toMatchObject({allowed:false,reason:"permission_denied"});
    const mail=transport(); expect(await executeInquiryMessageReview({...input,eventId:event.id,deps:{...input.deps,emailReady:async()=>true,transport:mail}})).toMatchObject({accepted:false,safeToResolve:false});
    expect(mail.send).not.toHaveBeenCalled();
  });
});

describe("supervised regular reply operator authority", () => {
  const operator = "a9350000-0000-4000-8000-000000000001";
  it.each(["authorized","revoked","owner_audience","commitment","policy_changed","flags_off"] as const)("executes only exact regular supervised drafts with current operator authority: %s", async state => {
    const { base, events, repository } = await fixture();
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "1"); vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1"); vi.stubEnv("DUAL_WRITE_PG", "1");
    base.messageRoute = async () => "strelva_reviews";
    await prepare("reply",base);
    const event = events[0]!;
    base.messageRoute = async () => "strelva_reviews";
    if (state === "owner_audience") event.metadata!.reviewAudience = "owner";
    if (state === "commitment") event.metadata!.messageBody = "The price is $40.";
    if (state === "policy_changed") await updateState(repository, state => { state.responsibilities[0]!.updatedAt = "2026-09-12T12:00:00Z"; });
    if (state === "flags_off") vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "0");
    const authorize = vi.fn(async (name:string,args:Record<string,unknown>) => ({ data: state !== "revoked" && name === "authorize_inquiry_operator_actor" && args.p_tenant_id === TENANT && args.p_actor_id === operator, error:null }));
    setInquiryRecordsDb({ rpc:authorize }); const mail=transport();
    const result=await executeInquiryMessageReview({ tenantId:TENANT,eventId:event.id,event,actorId:operator,deps:{ ...base,transport:mail } });
    if (state === "authorized") {
      expect(result).toMatchObject({ accepted:true,safeToResolve:true,receiptPersisted:true });
      expect(mail.send).toHaveBeenCalledTimes(1);
      expect((await repository.getSnapshot(TENANT,BUSINESS))?.state.responsibilityReceipts[0]).toMatchObject({ why: "Strelva reviewed the exact rendered message under the owner’s current supervised inquiry responsibility.", outcomeEvidence:expect.arrayContaining(["verified operator approval a[redacted phone]"]) });
    } else { expect(result).toMatchObject({ accepted:false,safeToResolve:false }); expect(mail.send).not.toHaveBeenCalled(); }
  });
});

describe("inquiry message review approval", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes a new supervised ordinary reply to Strelva review while the legacy switch stays unchanged", async () => {
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "1");
    vi.stubEnv("STRELVA_NEEDS_YOU_RELEASE", "0");
    const enabled = await fixture();
    await prepare("reply", { ...enabled.base, messageRoute: async () => "strelva_reviews" });
    expect(getInquiryMessageReviewMetadata(enabled.events[0]!)?.reviewAudience).toBe("operator");
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "0");
    const legacy = await fixture();
    await prepare("reply", legacy.base);
    expect(getInquiryMessageReviewMetadata(legacy.events[0]!)?.reviewAudience).toBe("owner");
  });

  it.each([
    ["reply", "ada@example.test", "customer"],
    ["owner_notification", "staff@approval.test", "client"],
    ["schedule_follow_up", "ada@example.test", "customer"],
  ] as const)("prepares and executes the governed %s action", async (action, recipient, audience) => {
    const { base, events, repository } = await fixture();
    const review = await prepare(action, base);
    const event = events[0]!;
    const metadata = getInquiryMessageReviewMetadata(event)!;
    expect(review.recipient).toBe(recipient);
    expect(metadata.messageBody).toBe(review.body);
    expect(metadata.messageDigest).toBe(review.messageDigest);

    const mail = transport();
    const result = await executeInquiryMessageReview({
      tenantId: TENANT,
      eventId: event.id,
      event,
      actorId: ACTOR,
      deps: { ...base, transport: mail },
    });

    expect(result).toMatchObject({ accepted: true, safeToResolve: true, receiptPersisted: true, verified: true, status: "verified" });
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.verify).toHaveBeenCalledTimes(1);
    const saved = await repository.getSnapshot(TENANT, BUSINESS);
    expect(saved?.state.responsibilityReceipts).toHaveLength(1);
    expect(saved?.state.responsibilityReceipts[0]).toMatchObject({ action: action === "owner_notification" ? "send_message" : action, status: "accepted" });
    expect((mail.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].audience).toBe(audience);

    const replay = await executeInquiryMessageReview({
      tenantId: TENANT,
      eventId: event.id,
      event,
      actorId: ACTOR,
      deps: { ...base, transport: mail },
    });
    expect(replay).toMatchObject({ accepted: true, safeToResolve: true, receiptPersisted: true, verified: true });
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect((await repository.getSnapshot(TENANT, BUSINESS))?.state.responsibilityReceipts).toHaveLength(1);
  });

  it("rejects a member who is not the current responsibility sponsor before sending", async () => {
    const { base, events } = await fixture();
    await prepare("reply", base);
    const mail = transport();
    const result = await executeInquiryMessageReview({
      tenantId: TENANT,
      eventId: events[0]!.id,
      event: events[0]!,
      actorId: "different-tenant-member",
      deps: { ...base, transport: mail },
    });
    expect(result).toMatchObject({ accepted: false, reason: "permission_denied" });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("rejects a changed rendered body or staff destination before the provider call", async () => {
    const first = await fixture();
    const review = await prepare("reply", first.base);
    const event = first.events[0]!;
    const mail = transport();
    const changedBody = await executeInquiryMessageReview({
      tenantId: TENANT,
      eventId: event.id,
      event,
      actorId: ACTOR,
      deps: {
        ...first.base,
        transport: mail,
        getLead: async () => ({ ...lead(), message: "A different request." }),
      },
    });
    expect(changedBody).toMatchObject({ accepted: false, reason: "message_mismatch" });
    expect(mail.send).not.toHaveBeenCalled();
    expect(review.messageDigest).toBe(getInquiryMessageReviewMetadata(event)!.messageDigest);

    const second = await fixture();
    const destination = { value: "staff@approval.test" };
    const route = async (inquiry: Parameters<NonNullable<InquiryMessageReviewDependencies["resolveRoute"]>>[0], policy: Parameters<NonNullable<InquiryMessageReviewDependencies["resolveRoute"]>>[1]) => ({
      tenantId: inquiry.tenantId,
      businessName: "Approval business",
      customerEmail: inquiry.email,
      ownerEmail: destination.value,
      ownerNotification: policy.ownerNotification,
      customerReplyTo: "reply@approval.test",
    });
    await prepare("owner_notification", { ...second.base, resolveRoute: route });
    destination.value = "other-staff@approval.test";
    const ownerMail = transport();
    const changedDestination = await executeInquiryMessageReview({
      tenantId: TENANT,
      eventId: second.events[0]!.id,
      event: second.events[0]!,
      actorId: ACTOR,
      deps: { ...second.base, resolveRoute: route, transport: ownerMail },
    });
    expect(changedDestination).toMatchObject({ accepted: false, reason: "message_mismatch" });
    expect(ownerMail.send).not.toHaveBeenCalled();
  });

  it.each([
    ["policy_changed", (state: InquiryEngineState) => { state.responsibilities[0]!.updatedAt = "2026-09-11T12:01:00.000Z"; }],
    ["delivery_unavailable", (state: InquiryEngineState) => { state.responsibilities[0]!.status = "paused"; }],
  ] as const)("rechecks the live responsibility and blocks %s before sending", async (expectedReason, update) => {
    const { base, events, repository } = await fixture();
    await prepare("reply", base);
    await updateState(repository, update);
    const mail = transport();
    const result = await executeInquiryMessageReview({
      tenantId: TENANT,
      eventId: events[0]!.id,
      event: events[0]!,
      actorId: ACTOR,
      deps: { ...base, transport: mail },
    });
    expect(result.reason).toBe(expectedReason);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("binds the review to the newest created responsibility, not the one updated last", async () => {
    const { base, repository } = await fixture();
    await updateState(repository, (state) => {
      // An older responsibility for the same intake, sponsored by someone else,
      // was touched after the current one (a receipt or a pause moves updatedAt).
      state.responsibilities.push({
        ...responsibility(),
        id: "responsibility-older",
        sponsorId: "former-sponsor",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-11T12:30:00.000Z",
      });
    });
    const review = await prepare("reply", base);
    expect(review.recipient).toBe("ada@example.test");
  });

  // The same table runs against the follow-up sweep and the receive seam.
  it.each([
    ["draft", false],
    ["live_unverified", true],
    ["live", true],
    ["paused", false],
    ["failed", false],
  ] as const)("prepares a message review for a %s inquiry intake only with live intent (%s)", async (status, current) => {
    const { base, repository } = await fixture();
    await updateState(repository, (state) => { state.capabilities[0]!.status = status; });
    const prepared = prepare("reply", base);
    if (current) await expect(prepared).resolves.toMatchObject({ recipient: "ada@example.test" });
    else await expect(prepared).rejects.toMatchObject({ code: "inquiry_changed" });
  });

  it("closes an accepted but unverified provider write without earning a clean receipt", async () => {
    const { base, events, repository } = await fixture();
    await prepare("reply", base);
    const mail = transport("unverified");
    const result = await executeInquiryMessageReview({
      tenantId: TENANT,
      eventId: events[0]!.id,
      event: events[0]!,
      actorId: ACTOR,
      deps: { ...base, transport: mail },
    });
    expect(result).toMatchObject({ accepted: true, safeToResolve: true, receiptPersisted: true, verified: false, status: "accepted_unverified" });
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect((await repository.getSnapshot(TENANT, BUSINESS))?.state.responsibilityReceipts).toHaveLength(0);

    const replay = await executeInquiryMessageReview({
      tenantId: TENANT,
      eventId: events[0]!.id,
      event: events[0]!,
      actorId: ACTOR,
      deps: { ...base, transport: mail },
    });
    expect(replay.accepted).toBe(true);
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it("repairs a verified receipt after the first snapshot save conflicts", async () => {
    const { base, events, repository } = await fixture();
    await prepare("reply", base);
    let conflict = true;
    const flakyRepository = Object.create(repository) as InquiryRepository;
    flakyRepository.compareAndSwap = async (input) => {
        if (conflict && input.expectedRevision !== null) {
          conflict = false;
          return { changed: false, reason: "conflict", current: await repository.getSnapshot(TENANT, BUSINESS) };
        }
        return repository.compareAndSwap(input);
    };
    const mail = transport();
    const result = await executeInquiryMessageReview({
      tenantId: TENANT,
      eventId: events[0]!.id,
      event: events[0]!,
      actorId: ACTOR,
      deps: { ...base, repository: flakyRepository, transport: mail },
    });
    expect(result).toMatchObject({ accepted: true, safeToResolve: true, receiptPersisted: true, verified: true });
    expect((await repository.getSnapshot(TENANT, BUSINESS))?.state.responsibilityReceipts).toHaveLength(1);
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it("never records a second review's message as sent when a different message already went out", async () => {
    const { base, events, repository } = await fixture();
    let current = lead();
    const deps: InquiryMessageReviewDependencies = { ...base, getLead: async () => current };
    await prepare("reply", deps);
    const first = events[0]!;
    const firstDigest = getInquiryMessageReviewMetadata(first)!.messageDigest;
    const mail = transport();
    const sent = await executeInquiryMessageReview({ tenantId: TENANT, eventId: first.id, event: first, actorId: ACTOR, deps: { ...deps, transport: mail } });
    expect(sent).toMatchObject({ accepted: true, verified: true, receiptPersisted: true });
    const checkpoint = await deps.store!.getCheckpoint({ tenantId: TENANT, inquiryId: INQUIRY, action: "reply" });
    expect(checkpoint?.messageDigest).toBe(firstDigest);

    // The inquiry changes, so a fresh review renders a different body for the
    // same inquiry and purpose. The provider already has the first message.
    current = { ...lead(), message: "Actually, can you call me instead?", fields: { ...lead().fields, message: "Actually, can you call me instead?" } };
    await prepare("reply", deps);
    const second = events[0]!;
    const secondMetadata = getInquiryMessageReviewMetadata(second)!;
    expect(secondMetadata.messageDigest).not.toBe(firstDigest);

    const result = await executeInquiryMessageReview({ tenantId: TENANT, eventId: second.id, event: second, actorId: ACTOR, deps: { ...deps, transport: mail } });
    expect(result).toMatchObject({ accepted: false, safeToResolve: false, receiptPersisted: false, status: "different_message_sent", reason: "different_message_already_sent" });
    expect(mail.send).toHaveBeenCalledTimes(1);
    const receipts = (await repository.getSnapshot(TENANT, BUSINESS))!.state.responsibilityReceipts;
    expect(receipts).toHaveLength(1);
    expect(receipts.some((receipt) => receipt.idempotencyKey?.includes(secondMetadata.messageDigest))).toBe(false);

    const reconciled = await reconcileInquiryMessageReview({ tenantId: TENANT, event: second, actorId: ACTOR, deps });
    expect(reconciled).toMatchObject({ safeToResolve: false, receiptPersisted: false, status: "different_message_sent" });
    expect((await repository.getSnapshot(TENANT, BUSINESS))!.state.responsibilityReceipts).toHaveLength(1);

    const outcome = await approveInquiryMessageReviewWithDependencies({
      tenantId: TENANT,
      businessId: BUSINESS,
      inquiryId: INQUIRY,
      action: "reply",
      actorId: ACTOR,
      reviewToken: (await prepare("reply", deps)).reviewToken,
      messageDigest: secondMetadata.messageDigest,
    }, { ...deps, resolveAction: async () => ({ changed: false, reason: "different_message_already_sent" }) });
    expect(outcome).toMatchObject({ status: "blocked", reason: "different_message_already_sent", retryable: false });
  });

  it("refuses a receipt for a checkpoint written before message digests were recorded", async () => {
    const { base, events, repository } = await fixture();
    await prepare("reply", base);
    const store = base.store!;
    // A legacy checkpoint: accepted and verified, but with no message digest.
    const claim = await store.beginAttempt({
      tenantId: TENANT,
      inquiryId: INQUIRY,
      action: "reply",
      maxAttempts: 1,
      now: AT,
      budget: { limit: 10, timezone: "UTC", policyVersion: "legacy", now: AT },
    });
    await store.markAccepted({ tenantId: TENANT, inquiryId: INQUIRY, action: "reply", attemptId: claim.attemptId!, acceptedAt: AT, providerMessageId: "provider-legacy" });
    await store.markVerified({ tenantId: TENANT, inquiryId: INQUIRY, action: "reply", attemptId: claim.attemptId!, evidence: ["legacy read-back"] });
    expect((await store.getCheckpoint({ tenantId: TENANT, inquiryId: INQUIRY, action: "reply" }))?.messageDigest).toBeUndefined();

    const mail = transport();
    const result = await executeInquiryMessageReview({ tenantId: TENANT, eventId: events[0]!.id, event: events[0]!, actorId: ACTOR, deps: { ...base, transport: mail } });
    expect(mail.send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ accepted: true, safeToResolve: false, receiptPersisted: false, providerMessageId: "provider-legacy", reason: "message_digest_unknown" });
    expect((await repository.getSnapshot(TENANT, BUSINESS))!.state.responsibilityReceipts).toHaveLength(0);

    const reconciled = await reconcileInquiryMessageReview({ tenantId: TENANT, event: events[0]!, actorId: ACTOR, deps: base });
    expect(reconciled).toMatchObject({ accepted: true, safeToResolve: false, receiptPersisted: false, reason: "message_digest_unknown" });
    expect((await repository.getSnapshot(TENANT, BUSINESS))!.state.responsibilityReceipts).toHaveLength(0);
  });

  it("retries a failed acceptance write so a transient store error does not lose the sent message", async () => {
    const { base, events, repository } = await fixture();
    await prepare("reply", base);
    const store = base.store!;
    let failures = 1;
    const flakyStore: InquiryDeliveryStore = {
      ...store,
      markAccepted: async (input) => {
        if (failures > 0) {
          failures -= 1;
          throw new Error("redis blip");
        }
        return store.markAccepted(input);
      },
    };
    const mail = transport();
    const result = await executeInquiryMessageReview({ tenantId: TENANT, eventId: events[0]!.id, event: events[0]!, actorId: ACTOR, deps: { ...base, store: flakyStore, transport: mail } });
    expect(result).toMatchObject({ accepted: true, safeToResolve: true, receiptPersisted: true, verified: true, providerMessageId: "provider-approval" });
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(await store.findByProviderMessageId({ tenantId: TENANT, providerMessageId: "provider-approval" })).toEqual({ inquiryId: INQUIRY, action: "reply" });
    expect((await repository.getSnapshot(TENANT, BUSINESS))!.state.responsibilityReceipts).toHaveLength(1);
  });

  it("keeps the provider id when the acceptance write keeps failing, and reconciliation repairs it without sending", async () => {
    const { base, events, repository } = await fixture();
    await prepare("reply", base);
    const store = base.store!;
    const brokenStore: InquiryDeliveryStore = {
      ...store,
      markAccepted: async () => {
        throw new Error("redis unavailable");
      },
    };
    const mail = transport();
    const event = events[0]!;
    const result = await executeInquiryMessageReview({ tenantId: TENANT, eventId: event.id, event, actorId: ACTOR, deps: { ...base, store: brokenStore, transport: mail } });
    expect(mail.send).toHaveBeenCalledTimes(1);
    // The send counts as accepted: the event must close its duplicate barrier
    // and carry the provider id as a second copy.
    expect(result).toMatchObject({ accepted: true, safeToResolve: false, status: "reconciliation_required", providerMessageId: "provider-approval", acceptedAt: AT });
    expect(result.deliveryAttemptId).toEqual(expect.any(String));
    const stuck = await store.getCheckpoint({ tenantId: TENANT, inquiryId: INQUIRY, action: "reply" });
    expect(stuck).toMatchObject({ status: "sending", attemptId: result.deliveryAttemptId });
    expect(await store.findByProviderMessageId({ tenantId: TENANT, providerMessageId: "provider-approval" })).toBeNull();

    // event-actions records the acceptance evidence on the governed event.
    const recorded = {
      ...event,
      metadata: {
        ...event.metadata,
        execution: {
          state: "external_accepted" as const,
          action: "approved" as const,
          actor: ACTOR,
          attemptId: "event-attempt",
          startedAt: AT,
          acceptance: { providerMessageId: result.providerMessageId, acceptedAt: result.acceptedAt, deliveryAttemptId: result.deliveryAttemptId },
        },
      },
    } as UnifiedEvent;
    const repaired = await reconcileInquiryMessageReview({ tenantId: TENANT, event: recorded, actorId: ACTOR, deps: { ...base, transport: mail } });
    expect(repaired).toMatchObject({ accepted: true, safeToResolve: true });
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(await store.getCheckpoint({ tenantId: TENANT, inquiryId: INQUIRY, action: "reply" })).toMatchObject({ status: "accepted", providerMessageId: "provider-approval", acceptedAt: AT });
    // Provider reports can now match the accepted message.
    expect(await store.findByProviderMessageId({ tenantId: TENANT, providerMessageId: "provider-approval" })).toEqual({ inquiryId: INQUIRY, action: "reply" });
    expect((await repository.getSnapshot(TENANT, BUSINESS))!.state.responsibilityReceipts).toHaveLength(0);
  });

  it("never repairs acceptance from evidence that belongs to another attempt", async () => {
    const { base, events } = await fixture();
    await prepare("reply", base);
    const store = base.store!;
    const mail = transport();
    const event = events[0]!;
    await executeInquiryMessageReview({ tenantId: TENANT, eventId: event.id, event, actorId: ACTOR, deps: { ...base, store: { ...store, markAccepted: async () => { throw new Error("down"); } }, transport: mail } });
    const recorded = {
      ...event,
      metadata: {
        ...event.metadata,
        execution: { state: "external_accepted" as const, action: "approved" as const, actor: ACTOR, attemptId: "x", startedAt: AT, acceptance: { providerMessageId: "provider-other", acceptedAt: AT, deliveryAttemptId: "another-attempt" } },
      },
    } as UnifiedEvent;
    const result = await reconcileInquiryMessageReview({ tenantId: TENANT, event: recorded, actorId: ACTOR, deps: base });
    expect(result).toMatchObject({ accepted: false, safeToResolve: false, status: "reconciliation_required" });
    expect(await store.getCheckpoint({ tenantId: TENANT, inquiryId: INQUIRY, action: "reply" })).toMatchObject({ status: "sending" });
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it("writes the owed message receipt exactly once when delivery is reported after the approval resolved", async () => {
    const { base, events, repository } = await fixture();
    await prepare("reply", base);
    const event = events[0]!;
    const mail: InquiryOutboundTransport = {
      send: vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "provider-approval", acceptedAt: AT })),
      verify: vi.fn(async () => ({ status: "deferred" as const, reason: "Recipient server is greylisting.", retryable: false })),
    };
    const result = await executeInquiryMessageReview({ tenantId: TENANT, eventId: event.id, event, actorId: ACTOR, deps: { ...base, transport: mail } });
    // Deferred is accepted and still open: the approval resolves with no receipt yet.
    expect(result).toMatchObject({ accepted: true, safeToResolve: true, receiptPersisted: true, verified: false, status: "deferred" });
    event.status = "approved";
    expect((await repository.getSnapshot(TENANT, BUSINESS))!.state.responsibilityReceipts).toHaveLength(0);

    const delivered = (eventId: string, at: string) => ({
      event: {
        type: "email.delivered",
        created_at: at,
        data: { email_id: "provider-approval", tags: { strelva_tenant_id: TENANT, strelva_inquiry_id: INQUIRY, strelva_action: "reply" } },
      },
      eventId,
      store: base.store!,
      persistMessageReceipt: (input: Parameters<typeof persistDeliveredInquiryMessageReceipt>[0]) => persistDeliveredInquiryMessageReceipt({ ...input, deps: base }),
    });

    // The first delivered report arrives while the workspace save is down:
    // the webhook stays retryable instead of dropping the owed receipt.
    let saveAvailable = false;
    const realCompareAndSwap = repository.compareAndSwap.bind(repository);
    repository.compareAndSwap = async (input) => (saveAvailable
      ? realCompareAndSwap(input)
      : { changed: false, reason: "conflict", current: await repository.getSnapshot(TENANT, BUSINESS) });
    const blocked = await reconcileInquiryProviderEvent(delivered("evt_delivered", "2026-09-11T12:03:00.000Z"));
    expect(blocked).toMatchObject({ status: "unavailable", reason: "message_receipt_unavailable" });
    expect((await repository.getSnapshot(TENANT, BUSINESS))!.state.responsibilityReceipts).toHaveLength(0);

    saveAvailable = true;
    const retried = await reconcileInquiryProviderEvent(delivered("evt_delivered", "2026-09-11T12:03:00.000Z"));
    expect(retried.status).toBe("duplicate");
    const receipts = (await repository.getSnapshot(TENANT, BUSINESS))!.state.responsibilityReceipts;
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ action: "reply", status: "accepted" });
    expect(receipts[0]!.idempotencyKey).toContain(getInquiryMessageReviewMetadata(event)!.messageDigest);
    expect(receipts[0]!.outcomeEvidence).toEqual(expect.arrayContaining(["provider status delivered", "provider message provider-approval"]));

    // Repeated and later reports never write a second receipt.
    expect((await reconcileInquiryProviderEvent(delivered("evt_delivered", "2026-09-11T12:03:00.000Z"))).status).toBe("duplicate");
    expect((await reconcileInquiryProviderEvent(delivered("evt_delivered_again", "2026-09-11T12:04:00.000Z"))).status).toBe("recorded");
    expect((await repository.getSnapshot(TENANT, BUSINESS))!.state.responsibilityReceipts).toHaveLength(1);
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it("writes no receipt on delivery when no approved review matches the sent message", async () => {
    const { base, events, repository } = await fixture();
    await prepare("reply", base);
    const event = events[0]!;
    const mail: InquiryOutboundTransport = {
      send: vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "provider-approval", acceptedAt: AT })),
      verify: vi.fn(async () => ({ status: "unverified" as const, reason: "Read-back unavailable.", retryable: false })),
    };
    await executeInquiryMessageReview({ tenantId: TENANT, eventId: event.id, event, actorId: ACTOR, deps: { ...base, transport: mail } });
    // The review was never approved (still pending with no accepted marker).
    const result = await reconcileInquiryProviderEvent({
      event: { type: "email.delivered", created_at: "2026-09-11T12:03:00.000Z", data: { email_id: "provider-approval", tags: { strelva_tenant_id: TENANT, strelva_inquiry_id: INQUIRY, strelva_action: "reply" } } },
      eventId: "evt_delivered",
      store: base.store!,
      persistMessageReceipt: (input) => persistDeliveredInquiryMessageReceipt({ ...input, deps: base }),
    });
    expect(result.status).toBe("recorded");
    expect((await repository.getSnapshot(TENANT, BUSINESS))!.state.responsibilityReceipts).toHaveLength(0);
  });

  it("leaves the event blocked when the receipt save is unavailable, then reconciles it", async () => {
    const { base, events, repository } = await fixture();
    await prepare("reply", base);
    let available = false;
    const repairableRepository = Object.create(repository) as InquiryRepository;
    repairableRepository.compareAndSwap = async (input) => (
      available
        ? repository.compareAndSwap(input)
        : { changed: false, reason: "conflict", current: await repository.getSnapshot(TENANT, BUSINESS) }
    );
    const mail = transport();
    const deps = { ...base, repository: repairableRepository, transport: mail };
    const first = await executeInquiryMessageReview({ tenantId: TENANT, eventId: events[0]!.id, event: events[0]!, actorId: ACTOR, deps });
    expect(first).toMatchObject({ accepted: true, safeToResolve: false, receiptPersisted: false, verified: true });
    expect(mail.send).toHaveBeenCalledTimes(1);

    available = true;
    const repaired = await reconcileInquiryMessageReview({ tenantId: TENANT, event: events[0]!, actorId: ACTOR, deps });
    expect(repaired).toMatchObject({ accepted: true, safeToResolve: true, receiptPersisted: true, verified: true, status: "verified" });
    expect((await repository.getSnapshot(TENANT, BUSINESS))?.state.responsibilityReceipts).toHaveLength(1);
    expect(mail.send).toHaveBeenCalledTimes(1);
  });
});

describe("Ask-authored inquiry replies", () => {
  it("persists the exact reply, reports its event ID and sends nothing during prepare", async () => {
    const { events, base } = await fixture();
    const send = vi.fn();
    const preview = await prepareInquiryMessageReviewWithDependencies({ tenantId: TENANT, businessId: BUSINESS, inquiryId: INQUIRY, action: "reply", actorId: ACTOR, authoredReply: "Thank you, Ada. Our team will review this." }, { ...base, transport: { send, verify: vi.fn() } });
    expect(preview.eventId).toBe(events[0]!.id);
    expect(preview.body).toContain("Thank you, Ada. Our team will review this.");
    expect(getInquiryMessageReviewMetadata(events[0]!)?.authoredReply).toBe("Thank you, Ada. Our team will review this.");
    expect(send).not.toHaveBeenCalled();
  });
  it("draft authority never becomes responsibility approval authority", async () => {
    const { events, base } = await fixture();
    const send = vi.fn();
    await prepareInquiryMessageReviewWithDependencies({ tenantId: TENANT, businessId: BUSINESS, inquiryId: INQUIRY, action: "reply", actorId: "member-drafter", authoredReply: "Thanks, Ada." }, { ...base, authorizeDraft: async () => true });
    expect(await executeInquiryMessageReview({ tenantId: TENANT, eventId: events[0]!.id, event: events[0]!, actorId: "member-drafter", deps: { ...base, transport: { send, verify: vi.fn() }, allowExternalSends: true } })).toMatchObject({ accepted: false, reason: "permission_denied" });
    expect(send).not.toHaveBeenCalled();
  });
  it("an authored reply persistence error leaves no approval event and no send", async () => {
    const { events, base } = await fixture(); const send = vi.fn();
    await expect(prepareInquiryMessageReviewWithDependencies({ tenantId: TENANT, businessId: BUSINESS, inquiryId: INQUIRY, action: "reply", actorId: ACTOR, authoredReply: "Thanks, Ada." }, { ...base, addApprovalEvent: async () => { throw new Error("persistence unavailable"); }, transport: { send, verify: vi.fn() } })).rejects.toThrow("persistence unavailable");
    expect(events).toHaveLength(0); expect(send).not.toHaveBeenCalled();
  });
  it("cross-workspace inquiry refuses before creating a draft", async () => {
    const { events, base } = await fixture();
    await expect(prepareInquiryMessageReviewWithDependencies({ tenantId: TENANT, businessId: "other-business", inquiryId: INQUIRY, action: "reply", actorId: ACTOR, authoredReply: "Thanks, Ada." }, base)).rejects.toThrow();
    expect(events).toHaveLength(0);
  });
});

describe("Ask-authored reply binding at the provider boundary", () => {
  it("execution sends the authored copy, not the template", async () => {
    const { events, base } = await fixture(); const mail = transport();
    await prepareInquiryMessageReviewWithDependencies({ tenantId: TENANT, businessId: BUSINESS, inquiryId: INQUIRY, action: "reply", actorId: ACTOR, authoredReply: "Thank you, Ada. Please describe what you need." }, base);
    expect(await executeInquiryMessageReview({ tenantId: TENANT, eventId: events[0]!.id, event: events[0]!, actorId: ACTOR, deps: { ...base, transport: mail } })).toMatchObject({ accepted: true, status: "verified" });
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ paragraphs: ["Thank you, Ada. Please describe what you need."] }) }));
  });
  it("tampered authored text is refused before send", async () => {
    const { events, base } = await fixture(); const mail = transport();
    await prepareInquiryMessageReviewWithDependencies({ tenantId: TENANT, businessId: BUSINESS, inquiryId: INQUIRY, action: "reply", actorId: ACTOR, authoredReply: "Thanks, Ada." }, base);
    events[0]!.metadata = { ...events[0]!.metadata, authoredReply: "We guarantee a price of $10." };
    expect(await executeInquiryMessageReview({ tenantId: TENANT, eventId: events[0]!.id, event: events[0]!, actorId: ACTOR, deps: { ...base, transport: mail } })).toMatchObject({ accepted: false, reason: "message_mismatch" });
    expect(mail.send).not.toHaveBeenCalled();
  });
});
