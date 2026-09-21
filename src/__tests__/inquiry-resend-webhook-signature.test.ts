import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reconcile = vi.hoisted(() => vi.fn());
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
  reconcile.mockResolvedValue({ status: "recorded" });
});

describe("Resend webhook SDK verification", () => {
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
