import { describe, expect, it, vi } from "vitest";
import { reconcileInquiryDecisionNotice } from "@/platform/needs-you/inquiry-notices";
const decisionId = "a0000000-0000-4000-8000-000000000001";
const workspaceId = "a0000000-0000-4000-8000-000000000002";
const event = { type: "email.bounced", created_at: "2026-10-06T12:01:00Z", data: { email_id: "urgent-mail", created_at: "2026-10-06T12:00:00Z",
  to: ["owner@example.test"], subject: "Business: a customer is waiting on you", tags: { strelva_inquiry_decision_id: decisionId, strelva_workspace_id: workspaceId } } };
describe("signed urgent inquiry notice receipts", () => {
  it("flags off and unrelated reports do no storage or sends", async () => {
    const rpc = vi.fn();
    expect(await reconcileInquiryDecisionNotice({ event, eventId: "evt" }, { enabled: () => false, rpc })).toEqual({ status: "ignored" });
    expect(await reconcileInquiryDecisionNotice({ event: { ...event, data: { ...event.data, tags: {} } }, eventId: "evt" }, { enabled: () => true, rpc })).toEqual({ status: "ignored" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("correlates immutable decision, scope, subject, recipient and provider acceptance", async () => {
    const rpc = vi.fn(async () => ({ status: "recorded" }));
    expect(await reconcileInquiryDecisionNotice({ event, eventId: "evt" }, { enabled: () => true, rpc })).toEqual({ status: "recorded" });
    expect(rpc).toHaveBeenCalledWith("record_inquiry_decision_notice_event", { p_decision_id: decisionId, p_workspace_id: workspaceId,
      p_provider_message_id: "urgent-mail", p_event_id: "evt", p_status: "bounced", p_event_at: event.created_at,
      p_accepted_at: event.data.created_at, p_recipients: ["owner@example.test"], p_subject: event.data.subject });
  });
  it("supports tag arrays and sent acceptance time", async () => {
    const rpc = vi.fn(async () => ({ status: "recorded" }));
    await reconcileInquiryDecisionNotice({ event: { ...event, type: "email.sent", data: { ...event.data, created_at: undefined,
      tags: Object.entries(event.data.tags).map(([name, value]) => ({ name, value })) } }, eventId: "evt" }, { enabled: () => true, rpc });
    expect(rpc).toHaveBeenCalledWith("record_inquiry_decision_notice_event", expect.objectContaining({ p_status: "accepted", p_accepted_at: event.created_at }));
  });
  it("invalid evidence never reaches storage; persistence failure remains retryable", async () => {
    const rpc = vi.fn(async () => { throw new Error("database down"); });
    expect(await reconcileInquiryDecisionNotice({ event: { ...event, data: { ...event.data, to: [] } }, eventId: "evt" }, { enabled: () => true, rpc })).toMatchObject({ status: "unmatched" });
    expect(rpc).not.toHaveBeenCalled();
    expect(await reconcileInquiryDecisionNotice({ event, eventId: "evt" }, { enabled: () => true, rpc })).toMatchObject({ status: "unavailable" });
  });
});
