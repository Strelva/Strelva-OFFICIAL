import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMemoryInquiryDeliveryStore,
  createInquiryDeliveryMessage,
  deliverInquiryAction,
  evaluateInquiryDelivery,
  getInquiryDeliveryMessageDigest,
  gateResponsibilityAction,
  isWithinResponsibilityHours,
  prepareInquiryDelivery,
  resolveInquiryRoute,
  renderInquiryMessage,
  type InquiryDeliveryApproval,
  type InquiryDeliveryDependencies,
  type InquiryDeliverySubmission,
  type InquiryOutboundTransport,
} from "@/products/inquiries/delivery";
import type { ResponsibilityPolicy } from "@/products/inquiries/contracts";

vi.mock("@/lib/tenant-crm", () => ({ addTenantActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: vi.fn(async () => ({ siteName: "Harbor Dental", ownerEmail: "owner@harbor.example" })) }));

const RECEIVED_AT = "2026-09-11T10:00:00.000Z";
const NOW = new Date("2026-09-11T12:00:00.000Z");

const inquiry: InquiryDeliverySubmission = {
  id: "inq_001",
  tenantId: "harbor-dental",
  name: "Avery Patient",
  email: "avery@example.com",
  message: "Could I book a first visit?",
  source: "contact-form",
  businessName: "Harbor Dental",
  capabilityId: "cap_inquiry",
  capabilityVersion: 1,
  receivedAt: RECEIVED_AT,
};

const route = {
  tenantId: inquiry.tenantId,
  businessName: "Harbor Dental",
  customerEmail: inquiry.email,
  ownerEmail: "owner@harbor.example",
  ownerNotification: "legacy" as const,
  customerReplyTo: "owner@harbor.example",
};

function gate(action: "reply" | "schedule_follow_up" | "owner_notification" = "reply") {
  return {
    allowed: true as const,
    action,
    evaluation: {
      decision: "allow" as const,
      action: action === "schedule_follow_up" ? "schedule_follow_up" as const : action === "owner_notification" ? "send_message" as const : "reply" as const,
      reason: "current responsibility evaluation",
      clause: null,
      disclosedAs: "Strelva" as const,
    },
    budget: { limit: 5, timezone: "UTC", policyVersion: "resp-1", now: NOW.toISOString() },
  };
}

function policy(overrides: Record<string, unknown> = {}) {
  return {
    version: "policy-1",
    paused: false,
    autoReply: { mode: "auto", enabled: true, delayHours: 0, budgetHours: 24, maxAttempts: 1 },
    followUp: { mode: "auto", enabled: true, delayHours: 2, budgetHours: 48, maxAttempts: 1 },
    ownerNotification: "legacy",
    ...overrides,
  } as const;
}

function deps(
  store: ReturnType<typeof createMemoryInquiryDeliveryStore>,
  transport: InquiryOutboundTransport,
  extra: Partial<InquiryDeliveryDependencies> = {},
): InquiryDeliveryDependencies {
  return {
    store,
    transport,
    now: () => NOW,
    resolveRoute: async () => route,
    isWorkspaceExited: async () => false,
    ...extra,
  };
}

describe("inquiry delivery connector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prepares the native inquiry actions without duplicating the legacy owner notice", async () => {
    const plan = await prepareInquiryDelivery(
      inquiry,
      policy({ followUp: { mode: "approval", enabled: true, delayHours: 3, budgetHours: 48, maxAttempts: 1 } }),
      { resolveRoute: async () => route },
      NOW,
    );

    expect(plan.route.ownerNotification).toBe("legacy");
    expect(plan.actions.map((item) => item.action)).toEqual(["reply", "schedule_follow_up"]);
    expect(plan.actions[0]).toMatchObject({ audience: "customer", recipient: inquiry.email, mode: "auto", status: "ready" });
    expect(plan.actions[1]).toMatchObject({ mode: "approval", status: "not_due", reason: "not_due" });
  });

  it("uses the trusted capability staff destination for a guarded owner route", async () => {
    const selected = await resolveInquiryRoute({ ...inquiry, staffDestination: "triage@harbor.example" }, policy());
    expect(selected.ownerEmail).toBe("triage@harbor.example");
    const fallback = await resolveInquiryRoute({ ...inquiry, staffDestination: "Support desk" }, policy());
    expect(fallback.ownerEmail).toBe("owner@harbor.example");
  });

  it("requires a durable store before any transport call", async () => {
    const store = createMemoryInquiryDeliveryStore();
    const transport: InquiryOutboundTransport = {
      send: vi.fn(async () => ({ status: "accepted" as const })),
      verify: vi.fn(async () => ({ status: "unavailable" as const, reason: "not used" })),
    };
    const unavailable = { ...store, durable: false };
    const result = await deliverInquiryAction(inquiry, "reply", {
      policy: policy(),
      responsibilityGate: gate(),
      deps: deps(unavailable, transport),
    });

    expect(result.status).toBe("unavailable");
    expect(result.reason).toBe("durable_delivery_state_required");
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("rechecks a paused policy immediately before send", async () => {
    const store = createMemoryInquiryDeliveryStore();
    const transport: InquiryOutboundTransport = {
      send: vi.fn(async () => ({ status: "accepted" as const })),
      verify: vi.fn(async () => ({ status: "verified" as const, evidence: ["provider receipt"] })),
    };
    const result = await deliverInquiryAction(inquiry, "reply", {
      policy: policy(),
      responsibilityGate: gate(),
      deps: deps(store, transport, {
        getPolicy: async () => ({ ...policy(), paused: true, pauseReason: "owner paused inquiry handling" }),
      }),
    });

    expect(result.status).toBe("paused");
    expect(result.reason).toBe("owner paused inquiry handling");
    expect(transport.send).not.toHaveBeenCalled();
    expect((await store.listTimeline?.({ tenantId: inquiry.tenantId, inquiryId: inquiry.id }))?.[0]?.outcome).toBe("blocked");
  });

  it("blocks a new delivery after exit while preserving accepted receipt recovery", async () => {
    const store = createMemoryInquiryDeliveryStore();
    const transport: InquiryOutboundTransport = {
      send: vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "provider-exit", acceptedAt: NOW.toISOString() })),
      verify: vi.fn()
        .mockResolvedValueOnce({ status: "unverified" as const, reason: "provider readback delayed", retryable: true })
        .mockResolvedValueOnce({ status: "verified" as const, evidence: ["provider readback"] }),
    };
    const first = await deliverInquiryAction(inquiry, "reply", {
      policy: policy(),
      responsibilityGate: gate(),
      deps: deps(store, transport),
    });
    const recovered = await deliverInquiryAction(inquiry, "reply", {
      policy: policy(),
      responsibilityGate: gate(),
      deps: deps(store, transport, { isWorkspaceExited: async () => true }),
    });

    expect(first.status).toBe("accepted_unverified");
    expect(recovered.status).toBe("verified");
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(transport.verify).toHaveBeenCalledTimes(2);
  });

  it("does not claim a new provider send after exit", async () => {
    const store = createMemoryInquiryDeliveryStore();
    const transport: InquiryOutboundTransport = {
      send: vi.fn(async () => ({ status: "accepted" as const })),
      verify: vi.fn(async () => ({ status: "unavailable" as const, reason: "not used" })),
    };
    const result = await deliverInquiryAction(inquiry, "reply", {
      policy: policy(),
      responsibilityGate: gate(),
      deps: deps(store, transport, { isWorkspaceExited: async () => true }),
    });

    expect(result).toMatchObject({ status: "paused", reason: "workspace_exit_future_work_blocked" });
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("rechecks exit after claiming and retires a late claim before provider send", async () => {
    const store = createMemoryInquiryDeliveryStore();
    const transport: InquiryOutboundTransport = {
      send: vi.fn(async () => ({ status: "accepted" as const })),
      verify: vi.fn(async () => ({ status: "unavailable" as const, reason: "not used" })),
    };
    let reads = 0;
    const result = await deliverInquiryAction(inquiry, "reply", {
      policy: policy(),
      responsibilityGate: gate(),
      deps: deps(store, transport, { isWorkspaceExited: async () => ++reads > 1 }),
    });

    expect(result).toMatchObject({ status: "paused", reason: "workspace_exit_future_work_blocked" });
    expect(reads).toBe(2);
    expect(transport.send).not.toHaveBeenCalled();
    expect(await store.getCheckpoint({ tenantId: inquiry.tenantId, inquiryId: inquiry.id, action: "reply" })).toMatchObject({
      status: "failed",
      failureReason: "workspace_exit_future_work_blocked",
      retryable: false,
    });
  });

  it("keeps an unknown provider outcome available for reconciliation after exit", async () => {
    const store = createMemoryInquiryDeliveryStore();
    const transport: InquiryOutboundTransport = {
      send: vi.fn(async () => ({ status: "unknown" as const, reason: "provider receipt pending" })),
      verify: vi.fn(async () => ({ status: "unavailable" as const, reason: "reconciliation reads the provider separately" })),
    };
    const first = await deliverInquiryAction(inquiry, "reply", {
      policy: policy(),
      responsibilityGate: gate(),
      deps: deps(store, transport),
    });
    const afterExit = await deliverInquiryAction(inquiry, "reply", {
      policy: policy(),
      responsibilityGate: gate(),
      deps: deps(store, transport, { isWorkspaceExited: async () => true }),
    });

    expect(first.status).toBe("reconciliation_required");
    expect(afterExit).toMatchObject({ status: "reconciliation_required", reason: "prior_attempt_may_have_reached_provider" });
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it("keeps supervised actions blocked until an exact, current approval exists", async () => {
    const supervised = policy({
      autoReply: { mode: "supervised", enabled: true, delayHours: 0, budgetHours: 24, maxAttempts: 1 },
    });
    const missing = evaluateInquiryDelivery(inquiry, "reply", supervised, null, NOW);
    expect(missing.status).toBe("awaiting_approval");

    const stale: InquiryDeliveryApproval = {
      inquiryId: inquiry.id,
      action: "reply",
      actorId: "owner-1",
      policyVersion: "old-policy",
      messageDigest: "old-digest",
      approvedAt: RECEIVED_AT,
      explicit: true,
    };
    expect(evaluateInquiryDelivery(inquiry, "reply", supervised, stale, NOW).status).toBe("awaiting_approval");

    const transport: InquiryOutboundTransport = {
      send: vi.fn(async () => ({ status: "accepted" as const })),
      verify: vi.fn(async () => ({ status: "unavailable" as const, reason: "provider does not expose read-back" })),
    };
    const approvalMessage = createInquiryDeliveryMessage(inquiry, route, "reply");
    const approval: InquiryDeliveryApproval = {
      ...stale,
      policyVersion: "policy-1",
      messageDigest: getInquiryDeliveryMessageDigest(approvalMessage!),
      capabilityId: inquiry.capabilityId,
      capabilityVersion: inquiry.capabilityVersion,
    };
    const result = await deliverInquiryAction(inquiry, "reply", {
      policy: supervised,
      approval,
      responsibilityGate: gate(),
      deps: deps(createMemoryInquiryDeliveryStore(), transport),
    });

    expect(result.status).toBe("accepted_unverified");
    expect(transport.send).toHaveBeenCalledTimes(1);
    const message = (transport.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(message.audience).toBe("customer");
    expect(message.options.footerNote).toContain("sent by Strelva");
    expect(renderInquiryMessage(message).text).toContain("Strelva");
  });

  it("records provider acceptance before read-back and never sends twice after verification fails", async () => {
    const store = createMemoryInquiryDeliveryStore();
    const transport: InquiryOutboundTransport = {
      send: vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "provider-1", acceptedAt: NOW.toISOString() })),
      verify: vi.fn(async () => ({ status: "unverified" as const, reason: "provider read-back failed", retryable: true })),
    };
    const first = await deliverInquiryAction(inquiry, "reply", { policy: policy(), responsibilityGate: gate(), deps: deps(store, transport) });
    const second = await deliverInquiryAction(inquiry, "reply", { policy: policy(), responsibilityGate: gate(), deps: deps(store, transport) });

    expect(first.status).toBe("accepted_unverified");
    expect(second.status).toBe("accepted_unverified");
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(transport.verify).toHaveBeenCalledTimes(2);
    expect((await store.getCheckpoint({ tenantId: inquiry.tenantId, inquiryId: inquiry.id, action: "reply" }))?.status).toBe("accepted_unverified");
  });

  it("retries a retryable failed acknowledgement within the attempt limit", async () => {
    const store = createMemoryInquiryDeliveryStore();
    const transport: InquiryOutboundTransport = {
      send: vi.fn()
        .mockResolvedValueOnce({ status: "rejected" as const, reason: "temporary provider outage", retryable: true })
        .mockResolvedValueOnce({ status: "accepted" as const, providerMessageId: "provider-retry", acceptedAt: NOW.toISOString() }),
      verify: vi.fn(async () => ({ status: "verified" as const, evidence: ["provider retry readback"] })),
    };
    const retryPolicy = policy({
      autoReply: { mode: "auto", enabled: true, delayHours: 0, budgetHours: 24, maxAttempts: 2 },
    });

    const first = await deliverInquiryAction(inquiry, "reply", {
      policy: retryPolicy,
      responsibilityGate: gate(),
      deps: deps(store, transport),
    });
    expect(first).toMatchObject({ status: "failed", retryable: true });
    expect(await store.getCheckpoint({ tenantId: inquiry.tenantId, inquiryId: inquiry.id, action: "reply" })).toMatchObject({
      status: "failed",
      retryable: true,
      attempts: 1,
    });

    const second = await deliverInquiryAction(inquiry, "reply", {
      policy: retryPolicy,
      responsibilityGate: gate(),
      deps: deps(store, transport),
    });
    expect(second.status).toBe("verified");
    expect(transport.send).toHaveBeenCalledTimes(2);
  });

  it("wedges an ambiguous provider result for reconciliation instead of retrying", async () => {
    const store = createMemoryInquiryDeliveryStore();
    const transport: InquiryOutboundTransport = {
      send: vi.fn(async () => ({ status: "unknown" as const, reason: "connection closed after provider request" })),
      verify: vi.fn(async () => ({ status: "unavailable" as const, reason: "no provider lookup" })),
    };
    const first = await deliverInquiryAction(inquiry, "reply", { policy: policy(), responsibilityGate: gate(), deps: deps(store, transport) });
    const second = await deliverInquiryAction(inquiry, "reply", { policy: policy(), responsibilityGate: gate(), deps: deps(store, transport) });

    expect(first.status).toBe("reconciliation_required");
    expect(second.status).toBe("reconciliation_required");
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it("does not allow the acceptance marker to be skipped when its durable write fails", async () => {
    const base = createMemoryInquiryDeliveryStore();
    const store = {
      ...base,
      markAccepted: vi.fn(async () => {
        throw new Error("redis unavailable");
      }),
    };
    const transport: InquiryOutboundTransport = {
      send: vi.fn(async () => ({ status: "accepted" as const })),
      verify: vi.fn(async () => ({ status: "verified" as const })),
    };
    const first = await deliverInquiryAction(inquiry, "reply", { policy: policy(), responsibilityGate: gate(), deps: deps(store, transport) });
    const second = await deliverInquiryAction(inquiry, "reply", { policy: policy(), responsibilityGate: gate(), deps: deps(store, transport) });

    expect(first.status).toBe("reconciliation_required");
    expect(first.reason).toBe("provider_accepted_marker_unavailable");
    expect(second.status).toBe("reconciliation_required");
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it("expires follow-up work at the configured budget", () => {
    const result = evaluateInquiryDelivery(
      inquiry,
      "schedule_follow_up",
      policy({ followUp: { mode: "auto", enabled: true, delayHours: 2, budgetHours: 1, maxAttempts: 1 } }),
      null,
      new Date("2026-09-11T12:00:01.000Z"),
    );
    expect(result.status).toBe("budget_exhausted");
    expect(result.retryable).toBe(false);
  });

  it("requires a fresh recheck with the exact inquiry and capability versions before follow-up", async () => {
    const followUpInquiry: InquiryDeliverySubmission = {
      ...inquiry,
      id: "inq_follow_up_versions",
      inquiryVersion: "lead-revision-1",
    };
    const followUpPolicy = policy({
      followUp: { mode: "auto", enabled: true, delayHours: 0, budgetHours: 24, maxAttempts: 1 },
    });
    const transport: InquiryOutboundTransport = {
      send: vi.fn(async () => ({ status: "accepted" as const })),
      verify: vi.fn(async () => ({ status: "unavailable" as const, reason: "no readback" })),
    };
    const missing = await deliverInquiryAction(followUpInquiry, "schedule_follow_up", {
      policy: followUpPolicy,
      responsibilityGate: gate("schedule_follow_up"),
      deps: deps(createMemoryInquiryDeliveryStore(), transport),
    });
    expect(missing).toMatchObject({ status: "paused", reason: "fresh_no_reply_check_required" });

    const recheck = {
      checkedAt: NOW.toISOString(),
      noReply: true,
      recipientActive: true,
      inquiryVersion: "lead-revision-1",
      capabilityId: "cap_inquiry",
      capabilityVersion: 1,
    } as const;
    const sent = await deliverInquiryAction(followUpInquiry, "schedule_follow_up", {
      policy: followUpPolicy,
      responsibilityGate: gate("schedule_follow_up"),
      deps: deps(createMemoryInquiryDeliveryStore(), transport, { getFollowUpRecheck: async () => recheck }),
    });
    expect(sent.status).toBe("accepted_unverified");
    expect(transport.send).toHaveBeenCalledTimes(1);

    const inquiryRevisionChanged = await deliverInquiryAction(followUpInquiry, "schedule_follow_up", {
      policy: followUpPolicy,
      responsibilityGate: gate("schedule_follow_up"),
      deps: deps(createMemoryInquiryDeliveryStore(), transport, { getFollowUpRecheck: async () => ({ ...recheck, inquiryVersion: "lead-revision-2" }) }),
    });
    expect(inquiryRevisionChanged.reason).toBe("inquiry_changed");

    const capabilityIdChanged = await deliverInquiryAction(followUpInquiry, "schedule_follow_up", {
      policy: followUpPolicy,
      responsibilityGate: gate("schedule_follow_up"),
      deps: deps(createMemoryInquiryDeliveryStore(), transport, { getFollowUpRecheck: async () => ({ ...recheck, capabilityId: "cap_other" }) }),
    });
    expect(capabilityIdChanged.reason).toBe("inquiry_capability_changed");

    const capabilityVersionChanged = await deliverInquiryAction(followUpInquiry, "schedule_follow_up", {
      policy: followUpPolicy,
      responsibilityGate: gate("schedule_follow_up"),
      deps: deps(createMemoryInquiryDeliveryStore(), transport, { getFollowUpRecheck: async () => ({ ...recheck, capabilityVersion: 2 }) }),
    });
    expect(capabilityVersionChanged.reason).toBe("inquiry_capability_changed");

    const sourceVersionMissing = await deliverInquiryAction({ ...followUpInquiry, capabilityVersion: null }, "schedule_follow_up", {
      policy: followUpPolicy,
      responsibilityGate: gate("schedule_follow_up"),
      deps: deps(createMemoryInquiryDeliveryStore(), transport, { getFollowUpRecheck: async () => recheck }),
    });
    expect(sourceVersionMissing.reason).toBe("inquiry_capability_version_required");
  });

  it("blocks a follow-up after a fresh customer reply and checks accepted markers first", async () => {
    const followUpInquiry: InquiryDeliverySubmission = {
      ...inquiry,
      id: "inq_follow_up_reply",
      inquiryVersion: "lead-revision-1",
    };
    const followUpPolicy = policy({
      followUp: { mode: "auto", enabled: true, delayHours: 0, budgetHours: 24, maxAttempts: 1 },
    });
    const transport: InquiryOutboundTransport = {
      send: vi.fn(async () => ({ status: "accepted" as const })),
      verify: vi.fn(async () => ({ status: "verified" as const, evidence: ["provider readback"] })),
    };
    const blocked = await deliverInquiryAction(followUpInquiry, "schedule_follow_up", {
      policy: followUpPolicy,
      responsibilityGate: gate("schedule_follow_up"),
      deps: deps(createMemoryInquiryDeliveryStore(), transport, {
        getFollowUpRecheck: async () => ({
          checkedAt: NOW.toISOString(),
          noReply: false,
          recipientActive: true,
          inquiryVersion: "lead-revision-1",
          capabilityId: "cap_inquiry",
          capabilityVersion: 1,
          reason: "customer replied",
        }),
      }),
    });
    expect(blocked).toMatchObject({ status: "paused", reason: "customer replied" });
    expect(transport.send).not.toHaveBeenCalled();

    const store = createMemoryInquiryDeliveryStore();
    const claim = await store.beginAttempt({
      tenantId: followUpInquiry.tenantId,
      inquiryId: followUpInquiry.id,
      action: "schedule_follow_up",
      maxAttempts: 1,
      now: NOW.toISOString(),
      budget: { limit: 5, timezone: "UTC", policyVersion: "resp-1", now: NOW.toISOString() },
    });
    expect(claim.attemptId).toBeTruthy();
    await store.markAccepted({
      tenantId: followUpInquiry.tenantId,
      inquiryId: followUpInquiry.id,
      action: "schedule_follow_up",
      attemptId: claim.attemptId!,
      acceptedAt: NOW.toISOString(),
      providerMessageId: "provider-follow-up",
    });
    const verified = await deliverInquiryAction(followUpInquiry, "schedule_follow_up", {
      policy: followUpPolicy,
      responsibilityGate: gate("schedule_follow_up"),
      deps: deps(store, transport, {
        getFollowUpRecheck: async () => ({
          checkedAt: NOW.toISOString(),
          noReply: false,
          recipientActive: true,
          inquiryVersion: "lead-revision-1",
          capabilityId: "cap_inquiry",
          capabilityVersion: 1,
          reason: "customer replied after original send",
        }),
      }),
    });
    expect(verified.status).toBe("verified");
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("reserves a tenant daily budget atomically and never labels suppression as a bounce", async () => {
    const budgetGate = { ...gate(), budget: { limit: 1, timezone: "UTC", policyVersion: "resp-budget", now: NOW.toISOString() } };
    const firstTransport: InquiryOutboundTransport = {
      send: vi.fn(async () => ({ status: "rejected" as const, reason: "suppressed by provider switch", retryable: true, outcome: "suppressed" as const })),
      verify: vi.fn(async () => ({ status: "unavailable" as const, reason: "not used" })),
    };
    const store = createMemoryInquiryDeliveryStore();
    const first = await deliverInquiryAction(inquiry, "reply", { policy: policy(), responsibilityGate: budgetGate, deps: deps(store, firstTransport) });
    const second = await deliverInquiryAction({ ...inquiry, id: "inq_002" }, "reply", { policy: policy(), responsibilityGate: budgetGate, deps: deps(store, firstTransport) });
    expect(first.status).toBe("failed");
    expect(second.status).toBe("budget_exhausted");
    expect(firstTransport.send).toHaveBeenCalledTimes(1);
    const timeline = await store.listTimeline?.({ tenantId: inquiry.tenantId, inquiryId: inquiry.id });
    expect(timeline?.some((event) => event.type === "notification_bounced")).toBe(false);
  });

  it("keeps checkpoints and timelines isolated when inquiry ids collide across tenants", async () => {
    const store = createMemoryInquiryDeliveryStore();
    const claim = await store.beginAttempt({
      tenantId: "tenant-a",
      inquiryId: "same-id",
      action: "reply",
      maxAttempts: 1,
      now: NOW.toISOString(),
      budget: { limit: 5, timezone: "UTC", policyVersion: "resp-1", now: NOW.toISOString() },
    });
    expect(claim.acquired).toBe(true);
    await store.appendTimeline({ tenantId: "tenant-a", inquiryId: "same-id", type: "status_changed", summary: "tenant a", outcome: "recorded" });
    expect(await store.getCheckpoint({ tenantId: "tenant-b", inquiryId: "same-id", action: "reply" })).toBeNull();
    expect(await store.listTimeline?.({ tenantId: "tenant-b", inquiryId: "same-id" })).toEqual([]);
  });
});

describe("responsibility delivery gates", () => {
  const baseResponsibility: ResponsibilityPolicy = {
    id: "resp-1",
    businessId: "harbor-dental",
    capabilityId: "cap_inquiry",
    title: "Supervised inquiry handling",
    scope: "One inquiry capability",
    allowedActions: ["reply", "schedule_follow_up"],
    preAuthorizedActions: [],
    never: [],
    approval: [{ action: "reply", sentence: "A person approves each reply." }],
    budget: { dailyMessages: 5, timezone: "UTC" },
    escalation: { primary: "owner-1", secondary: null },
    voice: "warm and clear",
    hours: { timezone: "UTC", days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
    trust: "supervised",
    status: "active",
    sponsorId: "owner-1",
    cleanReceiptCount: 0,
    failedReceiptCount: 0,
    requiredCleanReceipts: 3,
    trustChangedAt: null,
    createdAt: RECEIVED_AT,
    updatedAt: RECEIVED_AT,
  };

  it("requires an explicit evaluation even when the responsibility is active", () => {
    const gate = gateResponsibilityAction("reply", baseResponsibility, null, new Date("2026-09-11T12:00:00.000Z"));
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe("approval_required");
    expect(gateResponsibilityAction("reply", baseResponsibility, { decision: "allow", action: "reply", reason: "approved", clause: null, disclosedAs: "Strelva" }, new Date("2026-09-11T12:00:00.000Z")).allowed).toBe(true);
  });

  it("honors the policy's support hours in its configured timezone", () => {
    expect(isWithinResponsibilityHours(baseResponsibility, new Date("2026-09-11T16:00:00.000Z"))).toBe(true);
    expect(isWithinResponsibilityHours(baseResponsibility, new Date("2026-09-11T18:00:00.000Z"))).toBe(false);
  });
});
