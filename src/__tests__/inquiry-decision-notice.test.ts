import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyPreparedInquiryDecision, type InquiryDecisionNoticeDependencies } from "@/products/inquiries/decision-notice";
import type { UnifiedEvent } from "@/lib/types";
const lead = { id: "lead_1", name: "Dana", message: "Private party for 30?", createdAt: "2026-10-06T12:00:00Z" };
const event = { id: "event_1", tenantId: "fixture", source: "ai", type: "change_request", status: "pending", title: "Approve reply", body: "It costs $40 each.", createdAt: lead.createdAt,
  metadata: { kind: "inquiry_delivery_approval", inquiryId: lead.id, action: "reply", subject: "Private party", messageBody: "It costs $40 each." } } as UnifiedEvent;
function deps(): InquiryDecisionNoticeDependencies { return { released: vi.fn(async () => true), events: vi.fn(async () => [event]), workspace: vi.fn(async () => "fixture-workspace"), deliver: vi.fn(async () => "sent") }; }
afterEach(() => vi.unstubAllEnvs());
describe("inquiry and decision in one notice", () => {
  it("off or unreleased reads no draft and sends nothing", async () => {
    const d = deps();
    expect(await notifyPreparedInquiryDecision("fixture", lead, d)).toBe("none");
    expect(d.events).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "1"); vi.stubEnv("STRELVA_NEEDS_YOU_RELEASE", "1");
    d.released = vi.fn(async () => false);
    expect(await notifyPreparedInquiryDecision("fixture", lead, d)).toBe("none"); expect(d.events).not.toHaveBeenCalled();
  });
  it("uses only this tenant's pending owner decision and includes the inquiry", async () => {
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "1"); vi.stubEnv("STRELVA_NEEDS_YOU_RELEASE", "1");
    const d = deps();
    expect(await notifyPreparedInquiryDecision("fixture", lead, d)).toBe("sent");
    expect(d.deliver).toHaveBeenCalledWith("fixture-workspace", "fixture:event_1", { name: "Dana", message: lead.message });
    for (const changed of [{ ...event, tenantId: "other" }, { ...event, status: "approved" }, { ...event, metadata: { ...event.metadata, inquiryId: "lead_other" } }, { ...event, metadata: { ...event.metadata, action: "owner_notification" } }]) {
      const skipped = deps(); skipped.events = vi.fn(async () => [changed as UnifiedEvent]);
      expect(await notifyPreparedInquiryDecision("fixture", lead, skipped)).toBe("none"); expect(skipped.deliver).not.toHaveBeenCalled();
    }
  });
  it("never falls back to a second notice when the combined email was suppressed or failed", async () => {
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "1"); vi.stubEnv("STRELVA_NEEDS_YOU_RELEASE", "1");
    for (const status of ["suppressed", "failed"] as const) { const d = deps(); d.deliver = vi.fn(async () => status); expect(await notifyPreparedInquiryDecision("fixture", lead, d)).toBe(status); }
  });
});
