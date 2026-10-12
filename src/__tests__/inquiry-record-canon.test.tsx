import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { InquiryContextValue } from "@/experience/inquiries/context";
import type { InquiryRecord, InquirySurfaceSnapshot } from "@/experience/inquiries/contracts";
import { createPreviewInquiryAdapter } from "@/experience/inquiries/preview-fixture";

const mocked = vi.hoisted(() => ({ context: null as InquiryContextValue | null }));
vi.mock("@/experience/inquiries/context", () => ({ useInquiry: () => mocked.context }));
import { ViewRouter } from "@/experience/inquiries/views";

const record: InquiryRecord = { id: "test-record", businessId: "test-business", capabilityId: "test-form", capabilityVersion: 3, fields: { name: "Test Person", message: "A submitted message" }, status: "blocked", receivedAt: "2026-10-08T15:04:00Z", timelineEventIds: [], createdReceiptId: "test-created-receipt" };
const event = (outcome: "recorded" | "accepted" | "failed" | "blocked", index: number): InquirySurfaceSnapshot["state"]["timeline"][number] => ({ id: `test-event-${index}`, inquiryId: record.id, businessId: record.businessId, capabilityId: record.capabilityId, type: outcome === "accepted" ? "notification_accepted" : "note", actor: { id: "test-owner", label: "Recorded owner", kind: "person" }, summary: `${outcome} outcome evidence`, at: `2026-10-08T15:0${index}:00Z`, receiptId: `test-receipt-${index}`, causedByEventId: null, outcome, evidence: [`source-${index}`] });

function render({ events = [event("recorded", 0), event("accepted", 1), event("failed", 2), event("blocked", 3)], evidenceUnavailable = false, selected = true } = {}) {
  const base = createPreviewInquiryAdapter().getSnapshot();
  const snapshot: InquirySurfaceSnapshot = { ...base, deliveryEvidence: { available: !evidenceUnavailable, reason: evidenceUnavailable ? "test-unavailable" : null }, state: { ...base.state, inquiries: [record], timeline: events } };
  mocked.context = { snapshot, view: "record", requestId: null, inquiryId: record.id, initialRequestText: "", basePath: "/preview/strelva/inquiries", pending: false, message: "", error: "", selectedWork: undefined, selectedRecord: selected ? record : undefined, selectedCapability: undefined, selectedWhy: undefined, can: () => false, navigate: vi.fn(), perform: vi.fn(), clearFeedback: vi.fn() };
  return renderToStaticMarkup(createElement(ViewRouter));
}

describe("inquiry record on the canon kit", () => {
  it("keeps submitted facts, real event outcomes, actors, receipts and evidence", () => {
    const html = render();
    expect(html).toContain("Test Person");
    expect(html).toContain("A submitted message");
    expect(html).toContain("What happened");
    expect(html).toContain("Form at time of submission: Release");
    for (const outcome of ["recorded", "accepted", "failed", "blocked"]) expect(html).toContain(`${outcome} outcome evidence`);
    expect(html).toContain("Recorded owner");
    expect(html).toContain("test-receipt-3");
    expect(html).toContain("source-3");
    expect(html).not.toContain("0:00");
    expect(html).not.toContain("Delivered");
  });

  it("does not render internal actor IDs when a historical event has no name", () => {
    const unnamed = { ...event("recorded", 0), actor: { id: "actor-private-uuid", kind: "person" as const } };
    const html = render({ events: [unnamed] });
    expect(html).toContain("Actor not recorded");
    expect(html).not.toContain("actor-private-uuid");
  });

  it("keeps record permission checks on both changes and contextual requests", () => {
    const html = render();
    expect(html).toMatch(/disabled=""[^>]*>Assign to me/);
    expect(html).toMatch(/disabled=""[^>]*>Mark handled/);
    expect(html).toContain("Start from this inquiry");
    expect(html).not.toContain("data-review-send");
  });

  it("preserves missing delivery evidence and an empty factual history", () => {
    const html = render({ events: [], evidenceUnavailable: true });
    expect(html).toContain("Delivery evidence is unavailable right now");
    expect(html).toContain("No timeline events are recorded for this inquiry");
  });

  it("keeps select-all, individual selection, and inspect controls on an open list", () => {
    const html = render({ selected: false });
    expect(html).toContain("Select all records in this business");
    expect(html).toContain("Select test-record");
    expect(html).toContain("Inspect test-record");
    expect(html).toContain("aria-label=\"Inquiry records\"");
  });
});
