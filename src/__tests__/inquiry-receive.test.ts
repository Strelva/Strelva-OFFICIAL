import { describe, expect, it } from "vitest";

import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import { recordInquiryEvidence, stateForReceive } from "@/products/inquiries/receive";
import { createInMemoryInquiryRepository } from "@/products/inquiries/repository";

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
