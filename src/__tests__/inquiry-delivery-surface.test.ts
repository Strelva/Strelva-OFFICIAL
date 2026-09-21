import { describe, expect, it, vi } from "vitest";
import { createPreviewInquiryAdapter } from "@/experience/inquiries/preview-fixture";
import type { InquiryEngineState } from "@/products/inquiries/contracts";
import {
  createMemoryInquiryDeliveryStore,
  type InquiryDeliveryTimelineInput,
  type InquiryDeliveryStore,
} from "@/products/inquiries/delivery";
import {
  explainWhyWithDelivery,
  projectInquiryDeliveryTimeline,
  withoutInquiryDeliveryProjection,
} from "@/products/inquiries/delivery-surface";
import { InquiryEngine } from "@/products/inquiries/client";

const TENANT_ID = "buffalo-realty";
const AT = "2026-09-11T15:00:00.000Z";

async function publishedState(): Promise<{ state: InquiryEngineState; inquiryId: string; capabilityId: string }> {
  const adapter = createPreviewInquiryAdapter();
  const requestId = adapter.getSnapshot().state.requests[0]!.id;
  await adapter.execute({ kind: "accept-shape", requestId, input: { actorId: "fixture-owner" } });
  await adapter.execute({ kind: "rehearse", requestId, actorId: "fixture-owner" });
  await adapter.execute({ kind: "publish", requestId, actorId: "fixture-owner" });
  const capabilityId = adapter.getSnapshot().state.capabilities[0]!.id;
  const result = await adapter.execute({
    kind: "simulate-inquiry",
    capabilityId,
    actorId: "fixture-owner",
    fields: { name: "Avery Buyer", email: "avery@example.test", message: "Please call me." },
  });
  return { state: adapter.getSnapshot().state, inquiryId: result.record!.id, capabilityId };
}

function deliveryEvent(input: Partial<InquiryDeliveryTimelineInput> & Pick<InquiryDeliveryTimelineInput, "type" | "summary" | "outcome">, inquiryId: string, capabilityId: string): InquiryDeliveryTimelineInput {
  return {
    tenantId: input.tenantId ?? TENANT_ID,
    inquiryId,
    capabilityId: input.capabilityId ?? capabilityId,
    type: input.type,
    summary: input.summary,
    outcome: input.outcome,
    at: input.at ?? AT,
    actor: input.actor ?? { kind: "system" as const, id: "provider", label: "Provider" },
    evidence: input.evidence ?? [],
    ...(input.causedByEventId ? { causedByEventId: input.causedByEventId } : {}),
  };
}

describe("inquiry delivery surface projection", () => {
  it("projects a scoped bounce, marks the current record blocked, and keeps the id stable", async () => {
    const { state, inquiryId, capabilityId } = await publishedState();
    const store = createMemoryInquiryDeliveryStore();
    await store.appendTimeline(deliveryEvent({ type: "notification_bounced", summary: "The notification bounced.", outcome: "failed", evidence: ["Provider reported a permanent bounce."] }, inquiryId, capabilityId));
    await store.appendTimeline(deliveryEvent({ tenantId: "other-business", type: "notification_bounced", summary: "Foreign tenant bounce.", outcome: "failed" }, inquiryId, capabilityId));

    const first = await projectInquiryDeliveryTimeline({ tenantId: TENANT_ID, businessId: TENANT_ID, state, store });
    const second = await projectInquiryDeliveryTimeline({ tenantId: TENANT_ID, businessId: TENANT_ID, state, store });
    const record = first.state.inquiries.find((item) => item.id === inquiryId);
    expect(first.evidence).toEqual({ available: true, reason: null });
    expect(record?.status).toBe("blocked");
    expect(first.projectedEventIds).toEqual(second.projectedEventIds);
    expect(first.state.timeline.filter((event) => event.id.startsWith("delivery_")).map((event) => event.summary)).toEqual(["The notification bounced."]);
    const stripped = withoutInquiryDeliveryProjection(first.state, first.originalStatuses);
    expect(stripped.timeline.some((event) => event.id.startsWith("delivery_"))).toBe(false);
    expect(stripped.inquiries.find((item) => item.id === inquiryId)?.status).toBe(state.inquiries.find((item) => item.id === inquiryId)?.status);
  });

  it("uses the latest follow-up outcome while keeping permanent bounces blocked", async () => {
    const { state, inquiryId, capabilityId } = await publishedState();
    const store = createMemoryInquiryDeliveryStore();
    await store.appendTimeline(deliveryEvent({ type: "follow_up_blocked", summary: "Follow-up: recipient unavailable.", outcome: "blocked", at: "2026-09-11T15:00:00.000Z" }, inquiryId, capabilityId));
    await store.appendTimeline(deliveryEvent({ type: "follow_up_sent", summary: "Follow-up: provider accepted the follow-up.", outcome: "accepted", at: "2026-09-11T16:00:00.000Z" }, inquiryId, capabilityId));
    const recovered = await projectInquiryDeliveryTimeline({ tenantId: TENANT_ID, businessId: TENANT_ID, state, store });
    expect(recovered.state.inquiries.find((item) => item.id === inquiryId)?.status).toBe("new");

    await store.appendTimeline(deliveryEvent({ type: "notification_bounced", summary: "Reply: the address permanently bounced.", outcome: "failed", at: "2026-09-11T17:00:00.000Z" }, inquiryId, capabilityId));
    const bounced = await projectInquiryDeliveryTimeline({ tenantId: TENANT_ID, businessId: TENANT_ID, state, store });
    expect(bounced.state.inquiries.find((item) => item.id === inquiryId)?.status).toBe("blocked");
  });

  it("keeps handled records handled and never infers handled from acceptance or reply evidence", async () => {
    const { state, inquiryId, capabilityId } = await publishedState();
    const handled = structuredClone(state);
    handled.inquiries[0]!.status = "handled";
    const store = createMemoryInquiryDeliveryStore();
    await store.appendTimeline(deliveryEvent({ type: "notification_accepted", summary: "The provider accepted the notification.", outcome: "accepted" }, inquiryId, capabilityId));
    await store.appendTimeline(deliveryEvent({ type: "note", summary: "Customer reply received by the inquiry mailbox.", outcome: "recorded", actor: { kind: "customer", id: "provider-reply", label: "Customer" } }, inquiryId, capabilityId));
    const result = await projectInquiryDeliveryTimeline({ tenantId: TENANT_ID, businessId: TENANT_ID, state: handled, store });
    expect(result.state.inquiries.find((item) => item.id === inquiryId)?.status).toBe("handled");
    expect(result.state.timeline.some((event) => event.type === "notification_accepted")).toBe(true);
    expect(result.state.timeline.some((event) => event.type === "note" && event.summary.includes("Customer reply"))).toBe(true);
  });

  it("does not expose another tenant's delivery event", async () => {
    const { state, inquiryId, capabilityId } = await publishedState();
    const calls: Array<{ tenantId: string; inquiryId: string }> = [];
    const store = {
      ...createMemoryInquiryDeliveryStore(),
      listTimeline: vi.fn(async (input: { tenantId: string; inquiryId: string }) => {
        calls.push(input);
        return input.tenantId === TENANT_ID ? [
          deliveryEvent({ tenantId: "other-business", type: "note", summary: "Foreign tenant reply.", outcome: "recorded" }, input.inquiryId, capabilityId),
          deliveryEvent({ capabilityId: "other-capability", type: "note", summary: "Foreign capability reply.", outcome: "recorded" }, input.inquiryId, capabilityId),
          deliveryEvent({ type: "note", summary: "Scoped reply.", outcome: "recorded" }, input.inquiryId, capabilityId),
        ] : [];
      }),
    } satisfies InquiryDeliveryStore;
    const result = await projectInquiryDeliveryTimeline({ tenantId: TENANT_ID, businessId: TENANT_ID, state, store });
    expect(calls).toEqual([{ tenantId: TENANT_ID, inquiryId, limit: 100 }]);
    expect(result.state.timeline.filter((event) => event.id.startsWith("delivery_")).map((event) => event.summary)).toEqual(["Scoped reply."]);
  });

  it("surfaces unavailable provider evidence and removes Why fixes", async () => {
    const { state, inquiryId } = await publishedState();
    const unavailable: InquiryDeliveryStore = {
      ...createMemoryInquiryDeliveryStore(),
      listTimeline: vi.fn(async () => { throw new Error("redis unavailable"); }),
    };
    const result = await projectInquiryDeliveryTimeline({ tenantId: TENANT_ID, businessId: TENANT_ID, state, store: unavailable });
    const engine = new InquiryEngine({ businessId: TENANT_ID, state: result.state });
    expect(result.evidence).toEqual({ available: false, reason: "delivery_timeline_unavailable" });
    expect(explainWhyWithDelivery(engine, inquiryId, result.evidence).fix).toBeNull();
  });
});
