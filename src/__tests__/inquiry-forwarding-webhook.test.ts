import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), get: vi.fn(), reconcile: vi.fn(), workspace: vi.fn(), connected: vi.fn(), decision: vi.fn(), send: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    webhooks = { verify: mocks.verify };
    emails = { receiving: { get: mocks.get }, send: mocks.send };
  },
}));
vi.mock("@/products/inquiries/reconciliation", () => ({ reconcileInquiryProviderEvent: mocks.reconcile }));
vi.mock("@/products/inquiries/workspace-replies", () => ({ reconcileWorkspaceInquiryProviderEvent: mocks.workspace, workspaceInquiryRepliesEnabled: () => false }));
vi.mock("@/products/connected-sites/server", () => ({ reconcileConnectedInquiryOwnerNotice: mocks.connected }));
vi.mock("@/platform/needs-you", () => ({ reconcileInquiryDecisionNotice: mocks.decision }));

import { POST } from "@/app/api/webhooks/resend/route";
import { setForwardingStoreForTests, type ForwardingStore } from "@/products/inquiry-forwarding/store";
import * as fixtures from "./fixtures/forwarded-emails";

const BAKERY = "24500000-0000-4000-8000-0000000000b1";
const store = { issue: vi.fn(), revoke: vi.fn(), read: vi.fn(), resolve: vi.fn(), receive: vi.fn() } satisfies ForwardingStore;
const request = () => new Request("https://app.strelva.test/api/webhooks/resend", { method: "POST", body: "{}", headers: { "svix-id": "evt-1", "svix-timestamp": "123", "svix-signature": "sig" } });
function received(to: string[]) {
  return { type: "email.received", data: { email_id: fixtures.gmailForward.id, created_at: "2026-10-12T13:14:00.000Z", from: "pat@bakery.example.test", to, cc: [], bcc: [], message_id: "<x@y>", subject: "Fwd", attachments: [] } };
}
const resendMessage = (message: typeof fixtures.gmailForward) => ({ data: { object: "email", id: message.id, from: message.from, to: message.to, cc: message.cc, bcc: message.bcc, reply_to: message.replyTo, subject: message.subject, text: message.text, html: message.html, headers: message.headers, message_id: message.messageId, created_at: "2026-10-12T13:14:00.000Z", attachments: [] }, error: null });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_test");
  vi.stubEnv("RESEND_API_KEY", "re_test_fixture");
  vi.stubEnv("STRELVA_INQUIRY_FORWARDING_RELEASE", "1");
  vi.stubEnv("STRELVA_INQUIRIES_RELEASE", "1");
  vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1");
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "");
  vi.stubEnv("INQUIRY_REPLY_TO_DOMAIN", fixtures.INBOUND_DOMAIN);
  setForwardingStoreForTests(store);
  store.resolve.mockResolvedValue({ status: "active", addressId: "a1", workspaceId: BAKERY });
  store.receive.mockResolvedValue({ status: "recorded", id: "24500000-0000-4000-8000-000000000101", workspaceId: BAKERY });
  mocks.get.mockResolvedValue(resendMessage(fixtures.gmailForward));
  for (const fn of [mocks.decision, mocks.connected, mocks.workspace]) fn.mockResolvedValue({ status: "ignored" });
  mocks.reconcile.mockResolvedValue({ status: "ignored", reason: "provider_event_not_for_inquiry" });
});
afterEach(() => { vi.unstubAllEnvs(); setForwardingStoreForTests(null); });

describe("Resend webhook: forwarded inquiries", () => {
  it("records mail to a forwarding address before the other receivers, and never sends", async () => {
    mocks.verify.mockReturnValue(received([`${fixtures.BAKERY_LOCAL}@${fixtures.INBOUND_DOMAIN}`]));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, status: "recorded" });
    expect(mocks.get).toHaveBeenCalledWith(fixtures.gmailForward.id);
    expect(store.receive).toHaveBeenCalledWith(fixtures.BAKERY_LOCAL, expect.objectContaining({ kind: "inquiry", email: "jane.doe@customer.example.test" }));
    for (const fn of [mocks.decision, mocks.connected, mocks.workspace, mocks.reconcile, mocks.send]) expect(fn).not.toHaveBeenCalled();
  });

  it("a revoked address is answered 200 (no retry) and stores nothing", async () => {
    mocks.verify.mockReturnValue(received([`${fixtures.BAKERY_LOCAL}@${fixtures.INBOUND_DOMAIN}`]));
    store.resolve.mockResolvedValue({ status: "revoked" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, status: "refused" });
    expect(store.receive).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("an unreadable message is retried (503)", async () => {
    mocks.verify.mockReturnValue(received([`${fixtures.BAKERY_LOCAL}@${fixtures.INBOUND_DOMAIN}`]));
    mocks.get.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect((await POST(request())).status).toBe(503);
    expect(store.receive).not.toHaveBeenCalled();
  });

  it("a BCC is found from delivery headers only after every other receiver ignored it", async () => {
    mocks.verify.mockReturnValue(received(["pat@bakery.example.test"]));
    mocks.get.mockResolvedValue(resendMessage(fixtures.plainBccFormNotice));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.reconcile).toHaveBeenCalled();
    expect(store.receive).toHaveBeenCalledWith(fixtures.BAKERY_LOCAL, expect.objectContaining({ email: "riley.smith@customer.example.test" }));
  });

  it("flag off: the webhook behaves exactly as before", async () => {
    vi.stubEnv("STRELVA_INQUIRY_FORWARDING_RELEASE", "");
    mocks.verify.mockReturnValue(received([`${fixtures.BAKERY_LOCAL}@${fixtures.INBOUND_DOMAIN}`]));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, status: "ignored" });
    expect(mocks.reconcile).toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(store.resolve).not.toHaveBeenCalled();
  });
});
