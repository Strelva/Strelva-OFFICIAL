import { afterEach, describe, expect, it, vi } from "vitest";

import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import { evaluateInquiryResponsibility, recordInquiryEvidence, stateForReceive } from "@/products/inquiries/receive";
import { createInMemoryInquiryRepository } from "@/products/inquiries/repository";
import { createMemoryInquiryCaptureRepairStore } from "@/products/inquiries/reconciliation";
import { inquiryCurrentness } from "@/products/inquiries/currentness";

const TENANT = "acme";
const BUSINESS = "acme-business";
const CAPABILITY = "cap_inquiry";
const RECEIVED_AT = "2026-09-11T12:00:00.000Z";

function snapshot() {
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
      version: 2,
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
          { id: "timeline", label: "Timeline", kind: "select", component: "select_field", required: true, options: ["Soon", "Exploring"] },
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
          { id: "timeline", label: "Timeline", kind: "select", component: "select_field", required: true, options: ["Soon", "Exploring"] },
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

const fields = { name: "Ada Rivera", email: "ada@example.test", timeline: "Soon" };

describe("canonical inquiry receive seam", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("records paused intake without resuming its capability or authorizing customer work", async () => {
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1");
    vi.stubEnv("DUAL_WRITE_PG", "1");
    const repository = createInMemoryInquiryRepository();
    const state = snapshot().state;
    state.capabilities[0]!.status = "paused";
    await repository.compareAndSwap({ tenantId: TENANT, businessId: BUSINESS, expectedRevision: null, state });
    const result = await recordInquiryEvidence({ tenantId: TENANT, businessId: BUSINESS, inquiryId: "lead_paused", capabilityId: CAPABILITY,
      expectedCapabilityVersion: 2, fields, receivedAt: RECEIVED_AT, repository });
    expect(result.status).toBe("recorded");
    const saved = await repository.getSnapshot(TENANT, BUSINESS);
    expect(saved?.state.capabilities[0]!.status).toBe("paused");
    expect(saved?.state.timeline.filter((event) => event.inquiryId === "lead_paused").map((event) => event.type)).toEqual(["received", "record_created"]);
    expect(inquiryCurrentness(saved!.state, BUSINESS, { capabilityId: CAPABILITY, capabilityVersion: 2 })).toMatchObject({ current: false, reason: "not_live" });
  });
  it("records engine receipt and received/record-created timeline, then reads it idempotently", async () => {
    const repository = createInMemoryInquiryRepository();
    const seeded = await repository.compareAndSwap({
      tenantId: TENANT,
      businessId: BUSINESS,
      expectedRevision: null,
      state: snapshot().state,
    });
    expect(seeded.changed).toBe(true);

    const first = await recordInquiryEvidence({
      tenantId: TENANT,
      businessId: BUSINESS,
      inquiryId: "lead_1",
      capabilityId: CAPABILITY,
      expectedCapabilityVersion: 2,
      fields,
      receivedAt: RECEIVED_AT,
      repository,
    });
    expect(first.status).toBe("recorded");
    if (first.status !== "recorded") return;

    const saved = await repository.getSnapshot(TENANT, BUSINESS);
    expect(saved?.state.inquiries).toEqual([]);
    expect(saved?.state.actionReceipts.some((receipt) => receipt.id === first.receiptId && receipt.action === "record_inquiry")).toBe(true);
    expect(saved?.state.timeline.filter((event) => event.inquiryId === "lead_1").map((event) => event.type)).toEqual(["received", "record_created"]);

    const second = await recordInquiryEvidence({
      tenantId: TENANT,
      businessId: BUSINESS,
      inquiryId: "lead_1",
      capabilityId: CAPABILITY,
      expectedCapabilityVersion: 2,
      fields,
      receivedAt: RECEIVED_AT,
      repository,
    });
    expect(second).toMatchObject({ status: "already_recorded", receiptId: first.receiptId });
  });

  // The same table runs against message review approval and the follow-up sweep.
  it.each([
    ["draft", false],
    ["live_unverified", true],
    ["live", true],
    ["paused", false],
    ["failed", false],
  ] as const)("records an inquiry for a %s inquiry intake only with live intent (%s)", async (status, current) => {
    const repository = createInMemoryInquiryRepository();
    const state = snapshot().state;
    state.capabilities[0]!.status = status;
    await repository.compareAndSwap({ tenantId: TENANT, businessId: BUSINESS, expectedRevision: null, state });
    const result = await recordInquiryEvidence({
      tenantId: TENANT,
      businessId: BUSINESS,
      inquiryId: `lead_${status}`,
      capabilityId: CAPABILITY,
      expectedCapabilityVersion: 2,
      fields,
      receivedAt: RECEIVED_AT,
      repository,
      repairQueue: createMemoryInquiryCaptureRepairStore(),
    });
    expect(result.status).toBe(current ? "recorded" : "stale");
  });

  it.each([
    ["a republished intake", (state: ReturnType<typeof snapshot>["state"]) => { state.capabilities[0]!.live!.version = 3; }, "inquiry_capability_changed"],
    ["a paused intake", (state: ReturnType<typeof snapshot>["state"]) => { state.capabilities[0]!.status = "paused"; }, "inquiry_capability_unavailable"],
  ] as const)("queues a receipt repair when a submission meets %s", async (_label, change, reason) => {
    const repository = createInMemoryInquiryRepository();
    const state = snapshot().state;
    change(state);
    await repository.compareAndSwap({ tenantId: TENANT, businessId: BUSINESS, expectedRevision: null, state });
    const queue = createMemoryInquiryCaptureRepairStore();
    const result = await recordInquiryEvidence({
      tenantId: TENANT,
      businessId: BUSINESS,
      inquiryId: "lead_stale",
      capabilityId: CAPABILITY,
      expectedCapabilityVersion: 2,
      fields,
      receivedAt: RECEIVED_AT,
      repository,
      repairQueue: queue,
    });
    expect(result).toEqual({ status: "stale", reason });
    expect(await queue.listDue({ tenantId: TENANT, now: RECEIVED_AT, limit: 10 })).toMatchObject([{
      tenantId: TENANT,
      businessId: BUSINESS,
      inquiryId: "lead_stale",
      capabilityId: CAPABILITY,
      capabilityVersion: 2,
      lastError: reason,
    }]);
  });

  it("evaluates the newest created responsibility even when an older one sorts first", () => {
    const workspace = snapshot();
    const engine = new InquiryEngine({ businessId: BUSINESS, state: workspace.state, now: () => RECEIVED_AT });
    const base = {
      capabilityId: CAPABILITY,
      actorId: "owner-1",
      title: "Handle inquiries",
      scope: "Reply to inquiries.",
      allowedActions: ["reply" as const],
      escalation: { primary: "owner@acme.test", secondary: null },
      hours: { timezone: "UTC", days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" },
    };
    const older = engine.createResponsibility({ ...base, now: "2026-09-01T00:00:00.000Z" });
    engine.createResponsibility({ ...base, now: "2026-09-05T00:00:00.000Z" });
    // Pausing touches the older policy last, and it now sorts first.
    engine.pauseResponsibility(older.id, "owner-1", "2026-09-10T00:00:00.000Z");
    const state = engine.snapshot();
    state.responsibilities.reverse();
    const evaluation = evaluateInquiryResponsibility({ ...workspace, state: { ...state, inquiries: [] } }, CAPABILITY, "reply", "This reply is from Strelva.", RECEIVED_AT);
    expect(evaluation?.reason).not.toBe("This responsibility is paused.");
    expect(evaluation?.decision).toBe("approval_required");
  });

  it("rejects a changed select option before writing a receipt", async () => {
    const repository = createInMemoryInquiryRepository();
    await repository.compareAndSwap({ tenantId: TENANT, businessId: BUSINESS, expectedRevision: null, state: snapshot().state });
    const result = await recordInquiryEvidence({
      tenantId: TENANT,
      businessId: BUSINESS,
      inquiryId: "lead_2",
      capabilityId: CAPABILITY,
      expectedCapabilityVersion: 2,
      fields: { ...fields, timeline: "Never" },
      receivedAt: RECEIVED_AT,
      repository,
    });
    expect(result).toMatchObject({ status: "rejected" });
    expect((await repository.getSnapshot(TENANT, BUSINESS))?.state.timeline).toHaveLength(0);
  });

  it("rebuilds historical inquiry stubs from a request draft after live definitions are cleared", () => {
    const engine = new InquiryEngine({ businessId: BUSINESS, now: () => RECEIVED_AT });
    const work = engine.start({ actorId: "owner-one", intent: "Collect seller inquiries" });
    engine.acceptShape(work.id, { actorId: "owner-one", now: RECEIVED_AT });
    const state = engine.snapshot();
    const capability = state.capabilities[0]!;
    const draftVersion = state.requests[0]!.draft!.version;
    state.capabilities[0] = { ...capability, live: null, previousLive: null, status: "paused" };
    state.actionReceipts.push({
      id: "historical-receipt",
      businessId: BUSINESS,
      requestId: work.id,
      capabilityId: capability.id,
      inquiryId: "historic-inquiry",
      responsibilityId: null,
      actor: { kind: "strelva", id: "inquiry-record", label: "Strelva" },
      action: "record_inquiry",
      what: "Recorded a historical inquiry.",
      why: "The customer submitted the form.",
      lookedAt: [`capability version ${draftVersion}`],
      outcome: "recorded",
      evidence: ["historical receipt"],
      createdAt: RECEIVED_AT,
    });
    state.timeline.push({
      id: "historical-event",
      inquiryId: "historic-inquiry",
      businessId: BUSINESS,
      capabilityId: capability.id,
      type: "record_created",
      actor: { kind: "strelva", id: "inquiry-record", label: "Strelva" },
      summary: "Strelva created the historical inquiry record.",
      at: RECEIVED_AT,
      receiptId: "historical-receipt",
      causedByEventId: null,
      outcome: "recorded",
      evidence: ["historical receipt"],
    });

    const rebuilt = stateForReceive({
      businessId: BUSINESS,
      tenantId: TENANT,
      tenantStableId: null,
      revision: 2,
      stateVersion: 1,
      state: { ...state, inquiries: [] },
      updatedAt: RECEIVED_AT,
    });
    expect(rebuilt.inquiries).toHaveLength(1);
    expect(rebuilt.inquiries[0]).toMatchObject({
      id: "historic-inquiry",
      capabilityId: capability.id,
      capabilityVersion: draftVersion,
      timelineEventIds: ["historical-event"],
      createdReceiptId: "historical-receipt",
    });
  });
});
