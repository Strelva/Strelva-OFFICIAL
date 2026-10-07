import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reconcile = vi.hoisted(() => vi.fn());
const noticeRpc = vi.hoisted(() => vi.fn());
vi.mock("@/platform/infra/inquiry-records", async importOriginal => ({ ...await importOriginal<typeof import("@/platform/infra/inquiry-records")>(), inquiryRecordsRpc: noticeRpc, inquiryRecordsEnabled: () => true }));
vi.mock("@/products/inquiries/reconciliation", () => ({ reconcileInquiryProviderEvent: reconcile }));

import { POST } from "@/app/api/webhooks/resend/route";

const secret = `whsec_${Buffer.from("inquiry-webhook-test-secret").toString("base64")}`;

function signature(payload: string, eventId: string, timestamp: string): string {
  return createHmac("sha256", Buffer.from(secret.slice("whsec_".length), "base64"))
    .update(`${eventId}.${timestamp}.${payload}`)
    .digest("base64");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
  vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "1");
  noticeRpc.mockResolvedValue({ status: "recorded" });
  reconcile.mockResolvedValue({ status: "recorded" });
});

describe("Resend webhook SDK verification", () => {
  it("uses the real signature verifier and urgent receipt adapter before the bounded RPC", async () => {
    const event = { type: "email.bounced", created_at: "2026-10-06T12:01:00Z", data: { email_id: "urgent-mail", created_at: "2026-10-06T12:00:00Z", subject: "Exact urgent subject", to: ["owner@example.test"], tags: { strelva_inquiry_decision_id: "a0000000-0000-4000-8000-000000000001", strelva_workspace_id: "a0000000-0000-4000-8000-000000000002" } } };
    const body = JSON.stringify(event); const eventId = "urgent-sdk"; const timestamp = String(Math.floor(Date.now()/1000));
    const headers = { "svix-id": eventId, "svix-timestamp": timestamp, "svix-signature": `v1,${signature(body,eventId,timestamp)}` };
    expect((await POST(new Request("https://app.strelva.test/api/webhooks/resend", { method: "POST", body, headers }))).status).toBe(200);
    expect(noticeRpc).toHaveBeenCalledWith("record_inquiry_decision_notice_event", expect.objectContaining({ p_status: "bounced", p_event_id: eventId, p_subject: event.data.subject }));
    expect(reconcile).not.toHaveBeenCalled(); noticeRpc.mockClear();
    expect((await POST(new Request("https://app.strelva.test/api/webhooks/resend", { method: "POST", body: body.replace("bounced","delivered"), headers }))).status).toBe(401);
    expect(noticeRpc).not.toHaveBeenCalled();
  });
  it("accepts a valid synthetic Svix signature using the installed provider verifier", async () => {
    const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "provider-1" } });
    const eventId = "evt-sdk-1";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = await POST(new Request("https://app.strelva.test/api/webhooks/resend", {
      method: "POST",
      body: payload,
      headers: {
        "svix-id": eventId,
        "svix-timestamp": timestamp,
        "svix-signature": `v1,${signature(payload, eventId, timestamp)}`,
      },
    }));

    expect(response.status).toBe(200);
    expect(reconcile).toHaveBeenCalledWith({ event: { type: "email.delivered", data: { email_id: "provider-1" } }, eventId });
  });
});
