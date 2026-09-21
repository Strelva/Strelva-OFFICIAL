import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    webhooks = { verify: mocks.verify };
  },
}));
vi.mock("@/products/inquiries/reconciliation", () => ({ reconcileInquiryProviderEvent: mocks.reconcile }));

import { POST } from "@/app/api/webhooks/resend/route";
import { MAX_RESEND_WEBHOOK_BODY_BYTES } from "@/app/api/webhooks/resend/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_test");
  mocks.verify.mockReturnValue({ type: "email.delivered", data: { email_id: "provider-1" } });
  mocks.reconcile.mockResolvedValue({ status: "recorded" });
});

afterEach(() => vi.unstubAllEnvs());

describe("Resend inquiry webhook", () => {
  it("rejects a callback without all Svix headers before mutation", async () => {
    const response = await POST(new Request("https://app.strelva.test/api/webhooks/resend", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("rejects an oversized signed body before provider verification", async () => {
    const body = "x".repeat(MAX_RESEND_WEBHOOK_BODY_BYTES + 1);
    const response = await POST(new Request("https://app.strelva.test/api/webhooks/resend", {
      method: "POST",
      body,
      headers: {
        "content-length": String(MAX_RESEND_WEBHOOK_BODY_BYTES + 1),
        "svix-id": "evt-large",
        "svix-timestamp": "1720000000",
        "svix-signature": "v1,test",
      },
    }));
    expect(response.status).toBe(413);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("verifies the raw body and passes the signed event to reconciliation", async () => {
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "provider-1" } });
    const response = await POST(new Request("https://app.strelva.test/api/webhooks/resend", {
      method: "POST",
      body,
      headers: { "svix-id": "evt-1", "svix-timestamp": "1720000000", "svix-signature": "v1,test" },
    }));
    expect(response.status).toBe(200);
    expect(mocks.verify).toHaveBeenCalledWith({
      payload: body,
      headers: { id: "evt-1", timestamp: "1720000000", signature: "v1,test" },
      webhookSecret: "whsec_test",
    });
    expect(mocks.reconcile).toHaveBeenCalledWith({ event: expect.anything(), eventId: "evt-1" });
  });

  it("keeps a verified but unmatched event retryable", async () => {
    mocks.reconcile.mockResolvedValue({ status: "unmatched", reason: "delivery_checkpoint_unavailable" });
    const response = await POST(new Request("https://app.strelva.test/api/webhooks/resend", {
      method: "POST",
      body: "{}",
      headers: { "svix-id": "evt-1", "svix-timestamp": "1720000000", "svix-signature": "v1,test" },
    }));
    expect(response.status).toBe(503);
  });

  it("rejects a bad provider signature without parsing or reconciling", async () => {
    mocks.verify.mockImplementation(() => { throw new Error("bad signature"); });
    const response = await POST(new Request("https://app.strelva.test/api/webhooks/resend", {
      method: "POST",
      body: "{\"type\":\"email.bounced\"}",
      headers: { "svix-id": "evt-2", "svix-timestamp": "1720000000", "svix-signature": "v1,bad" },
    }));
    expect(response.status).toBe(401);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});
