import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LeadRecord } from "@/lib/leads";
import type { UnifiedEvent } from "@/lib/types";
import type { InquiryCapabilityDefinition, InquiryEngineState, ResponsibilityPolicy } from "@/products/inquiries/contracts";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import {
  executeInquiryMessageReview,
  getInquiryMessageReviewMetadata,
  prepareInquiryMessageReviewWithDependencies,
  reconcileInquiryMessageReview,
  type InquiryMessageReviewDependencies,
} from "@/products/inquiries/delivery-approval-engine";
import { createMemoryInquiryDeliveryStore } from "@/products/inquiries/delivery-store";
import type { InquiryOutboundTransport } from "@/products/inquiries/delivery-types";
import { createInMemoryInquiryRepository, type InquiryRepository } from "@/products/inquiries/repository";

vi.mock("@/lib/tenant-crm", () => ({ addTenantActivity: vi.fn(async () => undefined) }));

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

describe("inquiry message review approval", () => {
  beforeEach(() => vi.clearAllMocks());

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
