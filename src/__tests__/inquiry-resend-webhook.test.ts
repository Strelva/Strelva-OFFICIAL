import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  reconcile: vi.fn(),
  workspace: vi.fn(),
  connected: vi.fn(),
  decision: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    webhooks = { verify: mocks.verify };
  },
}));
vi.mock("@/products/inquiries/reconciliation", () => ({ reconcileInquiryProviderEvent: mocks.reconcile }));

vi.mock("@/products/inquiries/workspace-replies", () => ({ reconcileWorkspaceInquiryProviderEvent: mocks.workspace }));
vi.mock("@/products/connected-sites/server", () => ({ reconcileConnectedInquiryOwnerNotice: mocks.connected }));

vi.mock("@/platform/needs-you", () => ({ reconcileInquiryDecisionNotice: mocks.decision }));

import { POST } from "@/app/api/webhooks/resend/route";
import { MAX_RESEND_WEBHOOK_BODY_BYTES } from "@/app/api/webhooks/resend/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_test");
  mocks.verify.mockReturnValue({ type: "email.delivered", data: { email_id: "provider-1" } });
  mocks.reconcile.mockResolvedValue({ status: "recorded" });
  mocks.workspace.mockResolvedValue({ status: "ignored" });
  mocks.connected.mockResolvedValue({ status: "ignored" });
  mocks.decision.mockResolvedValue({ status: "ignored" });
});

afterEach(() => vi.unstubAllEnvs());

describe("Resend inquiry webhook", () => {
  it("routes signed urgent decision evidence directly and retries failed persistence", async () => {
    for (const [status, expected] of [["recorded",200],["unavailable",503]] as const) {
      mocks.decision.mockResolvedValue({ status });
      const response = await POST(new Request("https://app.strelva.test/api/webhooks/resend", { method: "POST", body: "{}", headers: { "svix-id": "signed-decision", "svix-timestamp": "123", "svix-signature": "signature" } }));
      expect(response.status).toBe(expected);
      expect(mocks.decision).toHaveBeenCalledWith({ event: mocks.verify.mock.results[0]?.value, eventId: "signed-decision" });
      expect(mocks.connected).not.toHaveBeenCalled(); expect(mocks.workspace).not.toHaveBeenCalled(); expect(mocks.reconcile).not.toHaveBeenCalled();
    }
  });
  it("reconciles connected notice outcomes only after signature verification", async () => {
    mocks.connected.mockResolvedValue({ status: "recorded" });
    const response = await POST(new Request("https://app.strelva.test/api/webhooks/resend", { method: "POST", body: "{}", headers: { "svix-id": "signed-connected", "svix-timestamp": "123", "svix-signature": "signature" } }));
    expect(response.status).toBe(200);
    expect(mocks.connected).toHaveBeenCalledWith({ event: mocks.verify.mock.results[0]?.value, eventId: "signed-connected" });
    expect(mocks.workspace).not.toHaveBeenCalled(); expect(mocks.reconcile).not.toHaveBeenCalled();
  });
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

  it("routes signed workspace receipts directly and never asks the Redis reconciler", async () => {
    mocks.workspace.mockResolvedValue({ status: "recorded" });
    const response = await POST(new Request("https://app.strelva.test/api/webhooks/resend", {
      method: "POST", body: "{}",
      headers: { "svix-id": "evt-workspace", "svix-timestamp": "1720000000", "svix-signature": "v1,test" },
    }));
    expect(response.status).toBe(200);
    expect(mocks.workspace).toHaveBeenCalledWith({ event: expect.anything(), eventId: "evt-workspace" });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("keeps failed workspace persistence retryable without another send", async () => {
    mocks.workspace.mockResolvedValue({ status: "unavailable", reason: "DB unavailable" });
    const response = await POST(new Request("https://app.strelva.test/api/webhooks/resend", {
      method: "POST", body: "{}",
      headers: { "svix-id": "evt-workspace", "svix-timestamp": "1720000000", "svix-signature": "v1,test" },
    }));
    expect(response.status).toBe(503);
    expect(mocks.reconcile).not.toHaveBeenCalled();
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
    expect(mocks.decision).not.toHaveBeenCalled();
  });
});
