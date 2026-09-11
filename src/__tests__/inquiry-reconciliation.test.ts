import { describe, expect, it, vi } from "vitest";

import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import {
  createMemoryInquiryDeliveryStore,
  type InquiryDeliveryStore,
} from "@/products/inquiries/delivery";
import {
  createMemoryInquiryCaptureRepairStore,
  createRedisInquiryCaptureRepairStore,
  enqueueInquiryCaptureRepair,
  reconcileInquiryCaptureRepairs,
  reconcileInquiryProviderEvent,
  type InquiryCaptureRepairStore,
} from "@/products/inquiries/reconciliation";
import { createInMemoryInquiryRepository, type InquiryRepository } from "@/products/inquiries/repository";
import { recordInquiryEvidence, recordInquiryEvidenceForRepair } from "@/products/inquiries/receive";
import type { LeadRecord } from "@/lib/leads";

const TENANT = "acme";
const BUSINESS = "acme-business";
const CAPABILITY = "cap_inquiry";
const RECEIVED_AT = "2026-09-11T12:00:00.000Z";

function publishedWorkspace() {
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
      routing: null,
      followUp: null,
      connections: [{ id: "email", provider: "email", status: "missing", consent: "missing", lastCheckedAt: null }],
    },
  }];
  return {
    businessId: BUSINESS,
    tenantId: TENANT,
    tenantStableId: null,
    revision: 1,
    stateVersion: 1 as const,
    state,
    updatedAt: RECEIVED_AT,
  };
}

function lead(id = "lead_repair"): LeadRecord {
  return {
    id,
    name: "Ada Rivera",
    email: "ada@example.test",
    fields: { name: "Ada Rivera", email: "ada@example.test" },
    capabilityId: CAPABILITY,
    capabilityVersion: 1,
    createdAt: RECEIVED_AT,
  };
}

function editedWorkspace() {
  const snapshot = publishedWorkspace();
  const capability = snapshot.state.capabilities[0]!;
  const historical = structuredClone(capability.live!);
  const current = structuredClone(historical);
  current.version = 2;
  current.form.title = "Updated contact form";
  current.updatedAt = "2026-09-11T12:05:00.000Z";
  const engine = new InquiryEngine({ businessId: BUSINESS, state: snapshot.state, now: () => RECEIVED_AT });
  const work = engine.start({ actorId: "owner", intent: "Historical published capability", capabilityId: CAPABILITY, requestId: "work-v1" });
  const state = engine.snapshot();
  const historicalWork = state.requests.find((item) => item.id === work.id)!;
  historicalWork.draft = historical;
  historicalWork.state = "handled";
  historicalWork.activeChangeId = null;
  snapshot.state.requests = state.requests;
  snapshot.state.capabilities[0] = {
    ...state.capabilities[0]!,
    live: current,
    previousLive: historical,
    activeRequestId: null,
    status: "live",
    updatedAt: current.updatedAt,
  };
  snapshot.state.changes.unshift({
    id: "published-v1",
    businessId: BUSINESS,
    requestId: work.id,
    capabilityId: CAPABILITY,
    baseVersion: null,
    targetVersion: 1,
    status: "published",
    summary: "Published inquiry form",
    items: [],
    preservedInquiryIds: [],
    undoOfChangeId: null,
    undoAvailable: true,
    actorIds: ["owner"],
    createdAt: RECEIVED_AT,
    updatedAt: RECEIVED_AT,
    providerAcceptanceId: "provider-v1",
    providerReceipt: null,
    verification: { actorId: "owner", version: 1, verified: true, checkedAt: RECEIVED_AT, evidence: ["published fixture"] },
    failureReason: null,
  });
  snapshot.revision = 2;
  snapshot.updatedAt = current.updatedAt;
  return snapshot;
}

function undoneWorkspace() {
  const snapshot = editedWorkspace();
  const capability = snapshot.state.capabilities[0]!;
  const priorEdit = structuredClone(capability.live!);
  const restored = structuredClone(snapshot.state.requests[0]!.draft!);
  restored.version = 3;
  restored.updatedAt = "2026-09-11T12:10:00.000Z";
  snapshot.state.capabilities[0] = {
    ...capability,
    live: restored,
    previousLive: priorEdit,
    updatedAt: restored.updatedAt,
  };
  snapshot.state.changes.unshift({
    id: "undone-v3",
    businessId: BUSINESS,
    requestId: snapshot.state.requests[0]!.id,
    capabilityId: CAPABILITY,
    baseVersion: 2,
    targetVersion: 3,
    status: "undone",
    summary: "Undid the inquiry edit",
    items: [],
    preservedInquiryIds: [],
    undoOfChangeId: "published-v1",
    undoAvailable: false,
    actorIds: ["owner"],
    createdAt: restored.updatedAt,
    updatedAt: restored.updatedAt,
    providerAcceptanceId: "provider-v3",
    providerReceipt: null,
    verification: { actorId: "owner", version: 3, verified: true, checkedAt: restored.updatedAt, evidence: ["undo fixture"] },
    failureReason: null,
  });
  snapshot.revision = 3;
  snapshot.updatedAt = restored.updatedAt;
  return snapshot;
}

async function acceptedStore(replyTo?: string): Promise<InquiryDeliveryStore> {
  const store = createMemoryInquiryDeliveryStore();
  const claim = await store.beginAttempt({
    tenantId: TENANT,
    inquiryId: "lead_reply",
    action: "reply",
    maxAttempts: 1,
    now: RECEIVED_AT,
    budget: { limit: 5, timezone: "UTC", policyVersion: "resp-1", now: RECEIVED_AT },
  });
  expect(claim.acquired).toBe(true);
  await store.markAccepted({
    tenantId: TENANT,
    inquiryId: "lead_reply",
    action: "reply",
    attemptId: claim.attemptId!,
    acceptedAt: RECEIVED_AT,
    providerMessageId: "provider-reply",
    ...(replyTo ? { replyTo } : {}),
  });
  return store;
}

describe("inquiry reconciliation", () => {
  it("queues a durable capture repair and records it after the workspace recovers", async () => {
    const queue = createMemoryInquiryCaptureRepairStore();
    const repository = createInMemoryInquiryRepository();
    await repository.compareAndSwap({
      tenantId: TENANT,
      businessId: BUSINESS,
      expectedRevision: null,
      state: publishedWorkspace().state,
    });
    await enqueueInquiryCaptureRepair({
      tenantId: TENANT,
      businessId: BUSINESS,
      inquiryId: "lead_repair",
      capabilityId: CAPABILITY,
      capabilityVersion: 1,
      enqueuedAt: RECEIVED_AT,
    }, queue);
    await enqueueInquiryCaptureRepair({
      tenantId: TENANT,
      businessId: BUSINESS,
      inquiryId: "lead_repair",
      capabilityId: CAPABILITY,
      capabilityVersion: 1,
      enqueuedAt: RECEIVED_AT,
    }, queue);

    const result = await reconcileInquiryCaptureRepairs({
      queue,
      repository,
      now: new Date(RECEIVED_AT),
      getLead: async () => lead(),
    });
    expect(result).toMatchObject({ status: "processed", queued: 1, processed: 1, recorded: 1, failed: 0 });
    expect((await repository.getSnapshot(TENANT, BUSINESS))?.state.actionReceipts.some((receipt) => receipt.inquiryId === "lead_repair")).toBe(true);
    expect(await queue.listDue({ tenantId: TENANT, now: RECEIVED_AT, limit: 10 })).toEqual([]);
  });

  it("keeps a repair pending when canonical workspace persistence is unavailable", async () => {
    const queue = createMemoryInquiryCaptureRepairStore();
    await enqueueInquiryCaptureRepair({
      tenantId: TENANT,
      businessId: BUSINESS,
      inquiryId: "lead_outage",
      capabilityId: CAPABILITY,
      capabilityVersion: 1,
      enqueuedAt: RECEIVED_AT,
    }, queue);
    const repository = {
      getSnapshot: vi.fn(async () => { throw new Error("workspace down"); }),
    } as unknown as InquiryRepository;
    const result = await reconcileInquiryCaptureRepairs({
      queue,
      repository,
      now: new Date(RECEIVED_AT),
      getLead: async () => lead("lead_outage"),
    });
    expect(result).toMatchObject({ processed: 1, recorded: 0, failed: 1 });
    expect(await queue.listDue({ tenantId: TENANT, now: new Date("2026-09-11T12:05:00.000Z").toISOString(), limit: 10 })).toMatchObject([{ inquiryId: "lead_outage", attempts: 1 }]);
  });

  it("rediscovers a retained capability lead when the request dies before enqueue", async () => {
    const queue = createMemoryInquiryCaptureRepairStore();
    const repository = createInMemoryInquiryRepository();
    await repository.compareAndSwap({
      tenantId: TENANT,
      businessId: BUSINESS,
      expectedRevision: null,
      state: publishedWorkspace().state,
    });

    const failedQueue: InquiryCaptureRepairStore = {
      ...queue,
      enqueue: vi.fn(async () => { throw new Error("simulated process interruption"); }),
    };
    const unavailableRepository = {
      getSnapshot: vi.fn(async () => { throw new Error("workspace down"); }),
    } as unknown as InquiryRepository;
    const evidence = await recordInquiryEvidence({
      tenantId: TENANT,
      businessId: BUSINESS,
      inquiryId: "lead_crashed",
      capabilityId: CAPABILITY,
      expectedCapabilityVersion: 1,
      fields: { name: "Ada Rivera", email: "ada@example.test" },
      receivedAt: RECEIVED_AT,
      repository: unavailableRepository,
      repairQueue: failedQueue,
    });
    expect(evidence).toMatchObject({ status: "unavailable", reason: "inquiry_workspace_unavailable" });

    const recovered = await reconcileInquiryCaptureRepairs({
      queue,
      repository,
      tenantIds: [TENANT],
      businessIds: { [TENANT]: BUSINESS },
      leads: async () => [lead("lead_crashed")],
      getLead: async () => lead("lead_crashed"),
      now: new Date(RECEIVED_AT),
    });
    expect(recovered).toMatchObject({ status: "processed", queued: 1, processed: 1, recorded: 1, failed: 0 });
    expect((await repository.getSnapshot(TENANT, BUSINESS))?.state.actionReceipts.some((receipt) => receipt.inquiryId === "lead_crashed")).toBe(true);
  });

  it("repairs a captured version after an edit and undo without changing the current capability", async () => {
    const queue = createMemoryInquiryCaptureRepairStore();
    const unavailableRepository = {
      getSnapshot: vi.fn(async () => { throw new Error("workspace down"); }),
    } as unknown as InquiryRepository;
    const failedQueue: InquiryCaptureRepairStore = {
      ...queue,
      enqueue: vi.fn(async () => { throw new Error("repair enqueue interrupted"); }),
    };
    const input = {
      tenantId: TENANT,
      businessId: BUSINESS,
      inquiryId: "lead_edited_before_repair",
      capabilityId: CAPABILITY,
      expectedCapabilityVersion: 1,
      fields: { name: "Ada Rivera", email: "ada@example.test" },
      receivedAt: RECEIVED_AT,
    };
    expect(await recordInquiryEvidence({ ...input, repository: unavailableRepository, repairQueue: failedQueue })).toMatchObject({
      status: "unavailable",
      reason: "inquiry_workspace_unavailable",
    });

    const edited = undoneWorkspace();
    const repository = createInMemoryInquiryRepository();
    await repository.compareAndSwap({
      tenantId: TENANT,
      businessId: BUSINESS,
      expectedRevision: null,
      state: edited.state,
    });
    const repaired = await reconcileInquiryCaptureRepairs({
      queue,
      repository,
      tenantIds: [TENANT],
      businessIds: { [TENANT]: BUSINESS },
      leads: async () => [lead(input.inquiryId)],
      getLead: async () => lead(input.inquiryId),
      now: new Date(RECEIVED_AT),
    });
    expect(repaired).toMatchObject({ status: "processed", queued: 1, processed: 1, recorded: 1, failed: 0 });

    const saved = await repository.getSnapshot(TENANT, BUSINESS);
    expect(saved?.state.capabilities[0]).toEqual(edited.state.capabilities[0]);
    const receipt = saved?.state.actionReceipts.find((item) => item.inquiryId === input.inquiryId);
    expect(receipt?.lookedAt).toContain("capability version 1");

    const duplicate = await recordInquiryEvidenceForRepair({ ...input, repository });
    expect(duplicate).toMatchObject({ status: "already_recorded" });
    expect((await repository.getSnapshot(TENANT, BUSINESS))?.revision).toBe(saved?.revision);
  });

  it("keeps public receive stale when the rendered version is no longer live", async () => {
    const repository = createInMemoryInquiryRepository();
    const edited = editedWorkspace();
    await repository.compareAndSwap({
      tenantId: TENANT,
      businessId: BUSINESS,
      expectedRevision: null,
      state: edited.state,
    });
    const result = await recordInquiryEvidence({
      tenantId: TENANT,
      businessId: BUSINESS,
      inquiryId: "lead_public_stale",
      capabilityId: CAPABILITY,
      expectedCapabilityVersion: 1,
      fields: { name: "Ada Rivera", email: "ada@example.test" },
      receivedAt: RECEIVED_AT,
      repository,
    });
    expect(result).toEqual({ status: "stale", reason: "inquiry_capability_changed" });
    expect((await repository.getSnapshot(TENANT, BUSINESS))?.state.actionReceipts.some((item) => item.inquiryId === "lead_public_stale")).toBe(false);
  });

  it("keeps a repair pending when the captured version has no historical witness", async () => {
    const unsupported = editedWorkspace();
    unsupported.state.capabilities[0] = {
      ...unsupported.state.capabilities[0]!,
      previousLive: null,
    };
    unsupported.state.requests[0]!.draft = null;
    const repository = createInMemoryInquiryRepository();
    await repository.compareAndSwap({ tenantId: TENANT, businessId: BUSINESS, expectedRevision: null, state: unsupported.state });
    const queue = createMemoryInquiryCaptureRepairStore();
    await enqueueInquiryCaptureRepair({
      tenantId: TENANT,
      businessId: BUSINESS,
      inquiryId: "lead_no_witness",
      capabilityId: CAPABILITY,
      capabilityVersion: 1,
      enqueuedAt: RECEIVED_AT,
    }, queue);

    const result = await reconcileInquiryCaptureRepairs({
      queue,
      repository,
      getLead: async () => lead("lead_no_witness"),
      now: new Date(RECEIVED_AT),
    });
    expect(result).toMatchObject({ processed: 1, recorded: 0, failed: 1 });
    expect((await repository.getSnapshot(TENANT, BUSINESS))?.state.actionReceipts.some((item) => item.inquiryId === "lead_no_witness")).toBe(false);
    expect(await queue.listDue({ tenantId: TENANT, now: new Date("2026-09-11T12:05:00.000Z").toISOString(), limit: 10 })).toMatchObject([{ inquiryId: "lead_no_witness", attempts: 1 }]);
  });

  it("writes a repair payload and due index in one Redis transaction", async () => {
    const state = new Map<string, unknown>();
    const index: string[] = [];
    let interrupted = true;
    const transaction = {
      commands: [] as Array<() => void>,
      set(key: string, value: unknown) {
        this.commands.push(() => state.set(key, value));
        return this;
      },
      zadd(_key: string, entry: { score: number; member: string }) {
        this.commands.push(() => index.push(entry.member));
        return this;
      },
      zremrangebyrank() {
        return this;
      },
      async exec() {
        if (interrupted) {
          interrupted = false;
          this.commands.length = 0;
          throw new Error("simulated process interruption");
        }
        for (const command of this.commands) command();
        return [];
      },
    };
    const redis = {
      get: vi.fn(async () => null),
      multi: vi.fn(() => transaction),
    };
    const store = createRedisInquiryCaptureRepairStore(
      redis as unknown as Parameters<typeof createRedisInquiryCaptureRepairStore>[0],
    );
    const job = {
      tenantId: TENANT,
      businessId: BUSINESS,
      inquiryId: "lead_atomic",
      capabilityId: CAPABILITY,
      capabilityVersion: 1,
      enqueuedAt: RECEIVED_AT,
    };

    await expect(store.enqueue(job)).rejects.toThrow("simulated process interruption");
    expect(state.size).toBe(0);
    expect(index).toEqual([]);

    await store.enqueue(job);
    expect(state.size).toBe(1);
    expect(index).toEqual(["lead_atomic"]);
    expect(redis.multi).toHaveBeenCalledTimes(2);
  });

  it("records a signed-provider bounce once and deduplicates the repeated event", async () => {
    const store = await acceptedStore();
    const event = {
      type: "email.bounced",
      created_at: RECEIVED_AT,
      data: {
        email_id: "provider-reply",
        tags: { strelva_tenant_id: TENANT, strelva_inquiry_id: "lead_reply", strelva_action: "reply" },
        bounce: { message: "Mailbox does not exist", type: " permanent", subType: " " },
      },
    };
    const first = await reconcileInquiryProviderEvent({ event, eventId: "evt_bounce", store });
    const second = await reconcileInquiryProviderEvent({ event, eventId: "evt_bounce", store });
    expect(first).toMatchObject({ status: "recorded", tenantId: TENANT, inquiryId: "lead_reply", action: "reply" });
    expect(second.status).toBe("duplicate");
    expect(await store.getCheckpoint({ tenantId: TENANT, inquiryId: "lead_reply", action: "reply" })).toMatchObject({ status: "bounced", providerOutcome: "bounced", providerEventId: "evt_bounce" });
    expect((await store.listTimeline?.({ tenantId: TENANT, inquiryId: "lead_reply" }))?.filter((eventItem) => eventItem.type === "notification_bounced")).toHaveLength(1);
  });

  it("keeps terminal provider failures when delivery events arrive out of order", async () => {
    const store = await acceptedStore();
    const tags = { strelva_tenant_id: TENANT, strelva_inquiry_id: "lead_reply", strelva_action: "reply" };
    const bounced = await reconcileInquiryProviderEvent({
      event: {
        type: "email.bounced",
        created_at: "2026-09-11T12:05:00.000Z",
        data: { email_id: "provider-reply", tags, bounce: { message: "Mailbox does not exist" } },
      },
      eventId: "evt_bounce_newer",
      store,
    });
    const staleDelivered = await reconcileInquiryProviderEvent({
      event: {
        type: "email.delivered",
        created_at: "2026-09-11T12:01:00.000Z",
        data: { email_id: "provider-reply", tags },
      },
      eventId: "evt_delivered_older",
      store,
    });
    expect(bounced.status).toBe("recorded");
    expect(staleDelivered.status).toBe("recorded");
    expect(await store.getCheckpoint({ tenantId: TENANT, inquiryId: "lead_reply", action: "reply" })).toMatchObject({
      status: "bounced",
      providerOutcome: "bounced",
      providerEventId: "evt_bounce_newer",
      providerEventAt: "2026-09-11T12:05:00.000Z",
    });
  });

  it("treats a provider complaint as terminal failed evidence", async () => {
    const store = await acceptedStore();
    const result = await reconcileInquiryProviderEvent({
      event: {
        type: "email.complained",
        created_at: RECEIVED_AT,
        data: {
          email_id: "provider-reply",
          tags: { strelva_tenant_id: TENANT, strelva_inquiry_id: "lead_reply", strelva_action: "reply" },
        },
      },
      eventId: "evt_complaint",
      store,
    });

    expect(result).toMatchObject({ status: "recorded", tenantId: TENANT, inquiryId: "lead_reply", action: "reply" });
    expect(await store.getCheckpoint({ tenantId: TENANT, inquiryId: "lead_reply", action: "reply" })).toMatchObject({
      status: "failed",
      providerOutcome: "failed",
      providerEventId: "evt_complaint",
    });
  });

  it("keeps an in-flight provider event retryable and protects claim ownership", async () => {
    const store = await acceptedStore();
    const event = {
      type: "email.delivered",
      created_at: RECEIVED_AT,
      data: {
        email_id: "provider-reply",
        tags: { strelva_tenant_id: TENANT, strelva_inquiry_id: "lead_reply", strelva_action: "reply" },
      },
    };
    const held = await store.claimProviderEvent({ tenantId: TENANT, providerEventId: "evt_in_flight" });
    expect(held.status).toBe("claimed");
    const retry = await reconcileInquiryProviderEvent({ event, eventId: "evt_in_flight", store });
    expect(retry).toMatchObject({ status: "unavailable", reason: "provider_outcome_processing" });

    await store.releaseProviderEvent?.({ tenantId: TENANT, providerEventId: "evt_in_flight", claimToken: held.status === "claimed" ? held.token : "" });
    const successor = await store.claimProviderEvent({ tenantId: TENANT, providerEventId: "evt_in_flight" });
    expect(successor.status).toBe("claimed");
    if (held.status === "claimed" && successor.status === "claimed") {
      await store.completeProviderEvent?.({ tenantId: TENANT, providerEventId: "evt_in_flight", claimToken: held.token });
      const stillProcessing = await store.claimProviderEvent({ tenantId: TENANT, providerEventId: "evt_in_flight" });
      expect(stillProcessing.status).toBe("processing");
      await store.completeProviderEvent?.({ tenantId: TENANT, providerEventId: "evt_in_flight", claimToken: successor.token });
    }
    const duplicate = await reconcileInquiryProviderEvent({ event, eventId: "evt_in_flight", store });
    expect(duplicate.status).toBe("duplicate");
  });

  it("repairs evidence after an abandoned provider lease instead of acknowledging in-flight work", async () => {
    const store = await acceptedStore();
    const event = {
      type: "email.delivered",
      created_at: RECEIVED_AT,
      data: {
        email_id: "provider-reply",
        tags: { strelva_tenant_id: TENANT, strelva_inquiry_id: "lead_reply", strelva_action: "reply" },
      },
    };
    const held = await store.claimProviderEvent({ tenantId: TENANT, providerEventId: "evt_abandoned" });
    expect(held.status).toBe("claimed");
    await store.markProviderOutcome({
      tenantId: TENANT,
      inquiryId: "lead_reply",
      action: "reply",
      providerMessageId: "provider-reply",
      providerEventId: "evt_abandoned",
      outcome: "delivered",
      at: RECEIVED_AT,
    });

    const inFlight = await reconcileInquiryProviderEvent({ event, eventId: "evt_abandoned", store });
    expect(inFlight).toMatchObject({ status: "unavailable", reason: "provider_outcome_processing" });

    if (held.status !== "claimed") throw new Error("test provider claim missing");
    await store.releaseProviderEvent?.({ tenantId: TENANT, providerEventId: "evt_abandoned", claimToken: held.token });
    const repaired = await reconcileInquiryProviderEvent({ event, eventId: "evt_abandoned", store });
    expect(repaired).toMatchObject({ status: "duplicate", tenantId: TENANT, inquiryId: "lead_reply", action: "reply" });
    expect((await store.claimProviderEvent({ tenantId: TENANT, providerEventId: "evt_abandoned" })).status).toBe("completed");
  });

  it("does not invent reply evidence when a signed event has no provider timestamp", async () => {
    const replyTo = "inquiry+abc123@reply.strelva.test";
    const store = await acceptedStore(replyTo);
    const result = await reconcileInquiryProviderEvent({
      event: {
        type: "email.received",
        data: {
          email_id: "provider-inbound-no-time",
          from: "Ada Rivera <ada@example.test>",
          to: [replyTo],
        },
      },
      eventId: "evt_reply_no_time",
      store,
      getLead: async () => lead("lead_reply"),
    });
    expect(result).toMatchObject({ status: "ignored", reason: "provider_reply_time_invalid" });
    expect(await store.getReplyState({ tenantId: TENANT, inquiryId: "lead_reply" })).toBeNull();
  });

  it("records a verified customer reply only when the sender matches the captured lead", async () => {
    const replyTo = "inquiry+abc123@reply.strelva.test";
    const store = await acceptedStore(replyTo);
    const event = {
      type: "email.received",
      created_at: RECEIVED_AT,
      data: {
        email_id: "provider-inbound",
        from: "Ada Rivera <ada@example.test>",
        to: [replyTo],
        subject: "Re: inquiry",
      },
    };
    const recorded = await reconcileInquiryProviderEvent({ event, eventId: "evt_reply", store, getLead: async () => lead("lead_reply") });
    expect(recorded).toMatchObject({ status: "recorded", tenantId: TENANT, inquiryId: "lead_reply" });
    expect(await store.getReplyState({ tenantId: TENANT, inquiryId: "lead_reply" })).toMatchObject({ providerMessageId: "provider-inbound", providerEventId: "evt_reply" });
    expect((await store.listTimeline?.({ tenantId: TENANT, inquiryId: "lead_reply" }))?.some((eventItem) => eventItem.type === "note" && eventItem.actor?.kind === "customer")).toBe(true);

    const rejected = await reconcileInquiryProviderEvent({
      event: { ...event, data: { ...event.data, from: "attacker@example.test" } },
      eventId: "evt_reply_attacker",
      store,
      getLead: async () => lead("lead_reply"),
    });
    expect(rejected).toMatchObject({ status: "unmatched", reason: "provider_reply_sender_mismatch" });
  });

  it("does not treat a tagged staff-mailbox event as a customer reply", async () => {
    const replyTo = "inquiry+abc123@reply.strelva.test";
    const store = await acceptedStore(replyTo);
    const result = await reconcileInquiryProviderEvent({
      event: {
        type: "email.received",
        created_at: RECEIVED_AT,
        data: {
          email_id: "provider-staff-mailbox",
          from: "Ada Rivera <ada@example.test>",
          to: ["team@acme.test"],
          tags: { strelva_tenant_id: TENANT, strelva_inquiry_id: "lead_reply" },
        },
      },
      eventId: "evt_staff_mailbox",
      store,
      getLead: async () => lead("lead_reply"),
    });

    expect(result).toMatchObject({ status: "unmatched", reason: "inquiry_reply_target_unavailable" });
    expect(await store.getReplyState({ tenantId: TENANT, inquiryId: "lead_reply" })).toBeNull();
  });
});
