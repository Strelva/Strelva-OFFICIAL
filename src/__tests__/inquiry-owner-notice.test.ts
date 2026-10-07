import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyInquiryOwner } from "@/products/inquiries/owner-notice";
import { readInquiryOwnerNoticeIssues } from "@/platform/operator-queue/inquiry-owner-notices";
import { createMemoryInquiryDeliveryStore } from "@/products/inquiries/delivery-store";
import type { InquiryOutboundTransport } from "@/products/inquiries/delivery-types";

const lead = { id: "lead_notice", name: "Dana", email: "dana@example.test", message: "A party?", createdAt: "2026-10-10T12:00:00Z" };
const route = async () => ({ tenantId: "notice-site", businessName: "Cottage", ownerEmail: "owner@example.test", customerEmail: null, customerReplyTo: null, ownerNotification: "send" as const });
const now = () => new Date(lead.createdAt);
afterEach(() => vi.unstubAllEnvs());

describe("inquiry owner notices", () => {
  function deps(verification: Awaited<ReturnType<InquiryOutboundTransport["verify"]>> = { status: "verified" }) {
    const send = vi.fn().mockResolvedValue({ status: "accepted", providerMessageId: "notice_1", acceptedAt: lead.createdAt });
    const verify = vi.fn().mockResolvedValue(verification);
    const record = vi.fn().mockResolvedValue("recorded");
    return { released: vi.fn().mockResolvedValue(true), route, record, delivery: { store: createMemoryInquiryDeliveryStore(), transport: { send, verify }, now, isWorkspaceExited: async () => false } };
  }
  it("flags off reaches neither release storage nor transport", async () => {
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "");
    const d = deps();
    expect(await notifyInquiryOwner({ tenantId: "notice-site", lead }, d)).toMatchObject({ status: "disabled" });
    expect(d.released).not.toHaveBeenCalled();
    expect(d.delivery.transport.send).not.toHaveBeenCalled();
    expect(d.record).not.toHaveBeenCalled();
  });
  it("workspace release off sends nothing", async () => {
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "1");
    const d = deps(); d.released.mockResolvedValue(false);
    expect(await notifyInquiryOwner({ tenantId: "notice-site", lead }, d)).toMatchObject({ status: "disabled", reason: "inquiries_not_released" });
    expect(d.delivery.transport.send).not.toHaveBeenCalled();
  });
  it("one immediate system notice uses owner audience and never retries after failed read-back", async () => {
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "1");
    const d = deps({ status: "unavailable", reason: "readback_failed" });
    for (let i = 0; i < 2; i++) expect(await notifyInquiryOwner({ tenantId: "notice-site", lead }, d)).toMatchObject({ status: "accepted_unverified", providerMessageId: "notice_1" });
    expect(d.delivery.transport.send).toHaveBeenCalledTimes(1);
    expect(d.delivery.transport.send).toHaveBeenCalledWith(expect.objectContaining({ audience: "client", to: "owner@example.test", action: "owner_notification" }));
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ ownerNotice: true, status: "accepted_unverified" }) }));
  });
  it("a rejected notice records suppression rather than sent", async () => {
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "1");
    const d = deps(); d.delivery.transport.send.mockResolvedValue({ status: "rejected", outcome: "suppressed", reason: "email_suppressed_or_unconfigured", retryable: true });
    const result = await notifyInquiryOwner({ tenantId: "notice-site", lead }, d);
    expect(result.acceptedAt).toBeUndefined();
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ acceptedAt: null, reason: "email_suppressed_or_unconfigured" }) }));
  });
  it("a bounced notice remains one send and creates an operator-visible issue", async () => {
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "1");
    const d = deps({ status: "bounced", reason: "mailbox unavailable" });
    expect(await notifyInquiryOwner({ tenantId: "notice-site", lead }, d)).toMatchObject({ status: "bounced" });
    await notifyInquiryOwner({ tenantId: "notice-site", lead }, d);
    expect(d.delivery.transport.send).toHaveBeenCalledTimes(1);
    const read = vi.fn().mockResolvedValue([{ tenantId: "notice-site", inquiryId: lead.id, at: lead.createdAt, status: "bounced" }]);
    expect(await readInquiryOwnerNoticeIssues(["notice-site"], read)).toMatchObject({ ok: true, rows: [{ title: "Owner not told: email bounced or failed" }] });
  });
  it("operator projection flags off is unchanged and failures name missing evidence", async () => {
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "");
    const read = vi.fn().mockRejectedValue(new Error("db down"));
    expect(await readInquiryOwnerNoticeIssues(["notice-site"], read)).toMatchObject({ ok: true, rows: [] });
    expect(read).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "1");
    expect(await readInquiryOwnerNoticeIssues(["notice-site"], read)).toMatchObject({ ok: false, reason: "Inquiry owner notice evidence unavailable" });
  });
});
