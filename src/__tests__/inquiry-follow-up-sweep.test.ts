import { describe, expect, it, vi } from "vitest";

import type { LeadRecord } from "@/lib/leads";
import type { TenantConfig } from "@/lib/types";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import type { ResponsibilityAction } from "@/products/inquiries/contracts";
import { createMemoryInquiryDeliveryStore } from "@/products/inquiries/delivery-store";
import { createInMemoryInquiryRepository } from "@/products/inquiries/repository";
import { runDueInquiryFollowUps } from "@/products/inquiries/follow-up-cron";
import type { InquiryOutboundTransport } from "@/products/inquiries/delivery-types";

const TENANT = "acme";
const BUSINESS = "acme-business";
const CAPABILITY = "cap_inquiry";
const INQUIRY = "lead_follow_up";
const RECEIVED_AT = "2026-09-11T12:00:00.000Z";
const SWEEP_AT = "2026-09-11T12:02:00.000Z";

function followUpState(
  status?: "handled" | "new",
  allowReply = false,
  withRouting = false,
  withFollowUp = true,
  trusted = true,
) {
  const engine = new InquiryEngine({ businessId: BUSINESS, now: () => RECEIVED_AT });
  const state = engine.snapshot();
  state.capabilities = [{
    id: CAPABILITY,
    businessId: BUSINESS,
    status: "live",
    previousLive: null,
    activeRequestId: null,
    updatedAt: RECEIVED_AT,
    live: {
      kind: "inquiry",
      id: CAPABILITY,
      businessId: BUSINESS,
      version: 1,
      name: "Acme inquiries",
      createdAt: RECEIVED_AT,
      updatedAt: RECEIVED_AT,
      form: {
        component: "form",
        id: `${CAPABILITY}:form`,
        title: "Contact Acme",
        intro: "Tell us what you need.",
        disclosure: "Strelva",
        fields: [
          { id: "name", label: "Name", kind: "text", component: "text_field", required: true },
          { id: "email", label: "Email", kind: "email", component: "email_field", required: true },
        ],
      },
      record: {
        component: "record_detail",
        type: "inquiry",
        singularLabel: "Inquiry",
        pluralLabel: "Inquiries",
        fields: [
          { id: "name", label: "Name", kind: "text", component: "text_field", required: true },
          { id: "email", label: "Email", kind: "email", component: "email_field", required: true },
        ],
      },
      routing: withRouting
        ? { component: "routing_rule", id: `${CAPABILITY}:routing`, sentence: "Send new inquiries to team@acme.test within 5 minutes.", channel: "email", destination: "team@acme.test", withinMinutes: 5 }
        : null,
      followUp: withFollowUp
        ? { component: "follow_up_rule", id: `${CAPABILITY}:follow-up`, sentence: "Check in once after 1 minute if the customer has not replied.", disclosure: "Strelva", afterMinutes: 1, maxAttempts: 1, messageTemplate: "Checking in with you." }
        : null,
      connections: [{ id: "email", provider: "email", status: "missing", consent: "missing", lastCheckedAt: null }],
    },
  }];
  const configured = new InquiryEngine({ businessId: BUSINESS, state, now: () => RECEIVED_AT });
  configured.start({
    requestId: "request_follow_up",
    actorId: "owner-1",
    capabilityId: CAPABILITY,
    intent: "Review inquiry follow-up behavior.",
    destination: "team@acme.test",
    ...(withFollowUp ? { followUpAfterMinutes: 1 } : {}),
    emailConnection: { status: "missing", consent: "missing", lastCheckedAt: null },
  });
  configured.receiveInquiry({
    capabilityId: CAPABILITY,
    expectedCapabilityVersion: 1,
    inquiryId: INQUIRY,
    fields: { name: "Ada Rivera", email: "ada@example.test" },
    receivedAt: RECEIVED_AT,
  });
  const allowedActions: ResponsibilityAction[] = ["schedule_follow_up"];
  if (allowReply) allowedActions.push("reply");
  if (withRouting) allowedActions.push("send_message");
  const responsibility = configured.createResponsibility({
    actorId: "owner-1",
    capabilityId: CAPABILITY,
    title: "Follow up on inquiries",
    scope: "Send one bounded follow-up to inquiry customers.",
    allowedActions,
    preAuthorizedActions: [...allowedActions],
    never: [],
    approval: [],
    budget: { dailyMessages: 20, timezone: "UTC" },
    escalation: { primary: "owner@acme.test", secondary: null },
    voice: "Friendly and clear.",
    hours: { timezone: "UTC", days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" },
    requiredCleanReceipts: 1,
  });
  configured.recordResponsibilityAction({
    responsibilityId: responsibility.id,
    action: "schedule_follow_up",
    actorId: "owner-1",
    approvedBy: "owner-1",
    idempotencyKey: "test:clean-follow-up",
    what: "Sent a clean test follow-up.",
    why: "The test establishes the standing rule.",
    messageBody: "This is from Strelva.",
    outcome: "accepted",
    outcomeEvidence: ["test evidence"],
  });
  if (trusted) configured.promoteResponsibility(responsibility.id, "owner-1", RECEIVED_AT);
  if (status === "handled") {
    configured.bulkUpdateInquiries({ inquiryIds: [INQUIRY], actorId: "owner-1", status: "handled", why: "The owner handled this inquiry." });
  }
  return configured.snapshot();
}

function lead(): LeadRecord {
  return {
    id: INQUIRY,
    name: "Ada Rivera",
    email: "ada@example.test",
    fields: { name: "Ada Rivera", email: "ada@example.test" },
    capabilityId: CAPABILITY,
    capabilityVersion: 1,
    createdAt: RECEIVED_AT,
  };
}

async function runSweep(
  state: ReturnType<InquiryEngine["snapshot"]>,
  transport: InquiryOutboundTransport,
  options: { store?: ReturnType<typeof createMemoryInquiryDeliveryStore>; repository?: ReturnType<typeof createInMemoryInquiryRepository>; useProviderOverride?: boolean; now?: string } = {},
) {
  const repository = options.repository ?? createInMemoryInquiryRepository();
  await repository.compareAndSwap({ tenantId: TENANT, businessId: BUSINESS, expectedRevision: null, state });
  const sweepOptions = {
    tenants: async () => [{ id: TENANT, stableId: BUSINESS, siteName: "Acme", active: true } as TenantConfig],
    leads: async () => [lead()],
    repository,
    store: options.store ?? createMemoryInquiryDeliveryStore(),
    transport,
    allowExternalSends: true,
    now: () => new Date(options.now ?? SWEEP_AT),
    ...(options.useProviderOverride === false ? {} : {
      getFollowUpRecheck: async (inquiry: { inquiryVersion?: string | number | null; id: string; capabilityId?: string | null; capabilityVersion?: number | null }, checkedAt: string) => ({
        checkedAt,
        noReply: true,
        recipientActive: true,
        inquiryVersion: inquiry.inquiryVersion ?? inquiry.id,
        capabilityId: inquiry.capabilityId ?? CAPABILITY,
        capabilityVersion: inquiry.capabilityVersion ?? 1,
        reason: "test_provider_readback_no_reply",
      }),
    }),
  };
  return runDueInquiryFollowUps(sweepOptions);
}

function transport(): InquiryOutboundTransport {
  return {
    send: vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "provider-follow-up", acceptedAt: RECEIVED_AT })),
    verify: vi.fn(async () => ({ status: "verified" as const, evidence: ["test provider evidence"] })),
  };
}

describe("default inquiry follow-up status projection", () => {
  it("does not send after the canonical inquiry status is handled", async () => {
    const mail = transport();
    const result = await runSweep(followUpState("handled"), mail);
    expect(result).toMatchObject({ candidates: 1, due: 0, attempted: 0, accepted: 0 });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("becomes eligible again after the grouped status is undone", async () => {
    const engine = new InquiryEngine({ businessId: BUSINESS, state: followUpState("handled"), now: () => RECEIVED_AT });
    const handled = engine.snapshot().changes[0];
    if (!handled) throw new Error("test handled change missing");
    engine.undoBulkChange(handled.id, { actorId: "owner-1", now: RECEIVED_AT });
    const mail = transport();
    const result = await runSweep(engine.snapshot(), mail);
    expect(result).toMatchObject({ candidates: 1, due: 1, attempted: 1, accepted: 1 });
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it("rechecks canonical and overlay status after candidate discovery", async () => {
    const repository = createInMemoryInquiryRepository();
    const initial = followUpState();
    await repository.compareAndSwap({ tenantId: TENANT, businessId: BUSINESS, expectedRevision: null, state: initial });
    const originalGetSnapshot = repository.getSnapshot.bind(repository);
    let reads = 0;
    repository.getSnapshot = async (tenantId, businessId) => {
      const current = await originalGetSnapshot(tenantId, businessId);
      reads += 1;
      if (reads === 2 && current) {
        await repository.upsertRecordOverlay({
          tenantId: TENANT,
          businessId: BUSINESS,
          inquiryId: INQUIRY,
          capabilityId: CAPABILITY,
          status: "handled",
          updatedBy: "owner-1",
        });
        return originalGetSnapshot(tenantId, businessId);
      }
      return current;
    };
    const mail = transport();
    const result = await runSweep(initial, mail, { repository });
    expect(mail.send).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({ status: "paused", reason: "inquiry_handled" });
  });

  it("sends the initial acknowledgement only for an explicitly pre-authorized reply", async () => {
    const mail = transport();
    const store = createMemoryInquiryDeliveryStore();
    const first = await runSweep(followUpState(undefined, true), mail, { store });
    expect(first).toMatchObject({ due: 0, attempted: 0, accepted: 0 });
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mail.send).mock.calls[0]?.[0]?.action).toBe("reply");
    const result = await runSweep(followUpState(undefined, true), mail, { store, now: "2026-09-11T12:04:00.000Z" });
    expect(result.accepted).toBe(1);
    expect(mail.send).toHaveBeenCalledTimes(2);
    expect(vi.mocked(mail.send).mock.calls.map((call) => call[0].action)).toEqual(["reply", "schedule_follow_up"]);
  });

  it("blocks the default sweep after a permanent bounce checkpoint", async () => {
    const store = createMemoryInquiryDeliveryStore();
    const claim = await store.beginAttempt({
      tenantId: TENANT,
      inquiryId: INQUIRY,
      action: "reply",
      maxAttempts: 1,
      now: RECEIVED_AT,
      budget: { limit: 5, timezone: "UTC", policyVersion: "reply", now: RECEIVED_AT },
    });
    await store.markAccepted({
      tenantId: TENANT,
      inquiryId: INQUIRY,
      action: "reply",
      attemptId: claim.attemptId!,
      acceptedAt: RECEIVED_AT,
      providerMessageId: "provider-reply",
    });
    await store.markProviderOutcome({
      tenantId: TENANT,
      inquiryId: INQUIRY,
      action: "reply",
      providerMessageId: "provider-reply",
      providerEventId: "evt-bounce",
      outcome: "bounced",
      at: RECEIVED_AT,
      reason: "mailbox unavailable",
    });
    const mail = transport();
    const result = await runSweep(followUpState(undefined, true), mail, { store, useProviderOverride: false });
    expect(mail.send).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({ status: "paused" });
  });

  it("blocks a follow-up when the routed staff notice permanently failed", async () => {
    const store = createMemoryInquiryDeliveryStore();
    const claim = await store.beginAttempt({
      tenantId: TENANT,
      inquiryId: INQUIRY,
      action: "owner_notification",
      maxAttempts: 1,
      now: RECEIVED_AT,
      budget: { limit: 5, timezone: "UTC", policyVersion: "owner-notification", now: RECEIVED_AT },
    });
    await store.markAccepted({
      tenantId: TENANT,
      inquiryId: INQUIRY,
      action: "owner_notification",
      attemptId: claim.attemptId!,
      acceptedAt: RECEIVED_AT,
      providerMessageId: "provider-owner-notice",
    });
    await store.markProviderOutcome({
      tenantId: TENANT,
      inquiryId: INQUIRY,
      action: "owner_notification",
      providerMessageId: "provider-owner-notice",
      providerEventId: "evt-owner-bounce",
      outcome: "bounced",
      at: RECEIVED_AT,
      reason: "staff mailbox unavailable",
    });

    const mail = transport();
    const result = await runSweep(followUpState(), mail, { store, useProviderOverride: false });
    expect(mail.send).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({ status: "paused", reason: "routing_notification_bounced" });
  });

  it("delivers a routing-only capability notice to its selected destination", async () => {
    const mail = transport();
    const store = createMemoryInquiryDeliveryStore();
    const result = await runSweep(followUpState(undefined, false, true, false), mail, { store });

    expect(result).toMatchObject({ candidates: 1, due: 1, attempted: 1, accepted: 1 });
    expect(result.results).toEqual([
      expect.objectContaining({ action: "owner_notification", status: "verified" }),
    ]);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mail.send).mock.calls[0]?.[0]).toMatchObject({
      action: "owner_notification",
      audience: "client",
      to: "team@acme.test",
    });
  });

  it("does not send a second legacy owner notice or invent customer work", async () => {
    const mail = transport();
    const store = createMemoryInquiryDeliveryStore();
    const first = await runSweep(followUpState(undefined, false, true, false), mail, { store });
    const second = await runSweep(followUpState(undefined, false, true, false), mail, {
      store,
      now: "2026-09-11T12:04:00.000Z",
    });

    expect(first.accepted).toBe(1);
    expect(second.accepted).toBe(1);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mail.send).mock.calls.map((call) => call[0].action)).toEqual(["owner_notification"]);
  });

  it("routes staff once before an explicitly authorized acknowledgement and follow-up", async () => {
    const mail = transport();
    const store = createMemoryInquiryDeliveryStore();
    const first = await runSweep(followUpState(undefined, true, true, true), mail, { store });
    const second = await runSweep(followUpState(undefined, true, true, true), mail, {
      store,
      now: "2026-09-11T12:04:00.000Z",
    });

    expect(first.accepted).toBe(1);
    expect(second.accepted).toBe(2);
    expect(mail.send).toHaveBeenCalledTimes(3);
    expect(vi.mocked(mail.send).mock.calls.map((call) => call[0].action)).toEqual([
      "owner_notification",
      "reply",
      "schedule_follow_up",
    ]);
    expect(vi.mocked(mail.send).mock.calls.filter((call) => call[0].action === "owner_notification")).toHaveLength(1);
  });

  it("keeps routing behind the supervised per-message approval gate", async () => {
    const mail = transport();
    const result = await runSweep(followUpState(undefined, false, true, false, false), mail);

    expect(result).toMatchObject({ candidates: 1, due: 1, attempted: 1, accepted: 0, blocked: 1 });
    expect(result.results[0]).toMatchObject({
      action: "owner_notification",
      status: "awaiting_approval",
      reason: "approval_required",
    });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("retries a retryable routing failure and records the later acceptance", async () => {
    const mail: InquiryOutboundTransport = {
      send: vi.fn()
        .mockResolvedValueOnce({ status: "rejected", reason: "temporary provider outage", retryable: true })
        .mockResolvedValueOnce({ status: "accepted", providerMessageId: "provider-owner-retry", acceptedAt: RECEIVED_AT }),
      verify: vi.fn(async () => ({ status: "verified" as const, evidence: ["test provider evidence"] })),
    };
    const store = createMemoryInquiryDeliveryStore();
    const first = await runSweep(followUpState(undefined, false, true, false), mail, { store });
    const second = await runSweep(followUpState(undefined, false, true, false), mail, {
      store,
      now: "2026-09-11T12:04:00.000Z",
    });

    expect(first.results[0]).toMatchObject({ action: "owner_notification", status: "failed", retryable: true });
    expect(second.results[0]).toMatchObject({ action: "owner_notification", status: "verified" });
    expect(mail.send).toHaveBeenCalledTimes(2);
  });
});
