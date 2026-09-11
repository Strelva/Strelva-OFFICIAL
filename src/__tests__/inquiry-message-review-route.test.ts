import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  actor: vi.fn(),
  access: vi.fn(),
  permission: vi.fn(),
  config: vi.fn(),
  release: vi.fn(),
  prepare: vi.fn(),
  approve: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  verifyAuth: mocks.verifyAuth,
  getAuthUserId: mocks.actor,
  requireTenantAccess: mocks.access,
  requireTenantPermission: mocks.permission,
}));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.config }));
vi.mock("@/products/inquiries", () => ({
  inquiryReleaseEnabled: mocks.release,
  prepareInquiryMessageReview: mocks.prepare,
  approveInquiryMessageReview: mocks.approve,
}));

import { POST } from "@/app/api/inquiry-workspace/message-review/route";

const config = { id: "tenant-a", stableId: "business-a", active: true };
const review = {
  reviewToken: "review-token",
  inquiryId: "inquiry-1",
  action: "reply" as const,
  recipient: "customer@example.com",
  subject: "We received your message",
  body: "Hi Sam, your message was received.",
  messageDigest: "a".repeat(64),
  policyVersion: "policy-v1",
  capabilityId: "capability-1",
  capabilityVersion: 1,
  preparedAt: "2026-09-11T16:00:00.000Z",
  expiresAt: "2026-09-11T17:00:00.000Z",
};

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://tenant-a.strelva.com/api/inquiry-workspace/message-review", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://tenant-a.strelva.com", ...headers },
    body: JSON.stringify(body),
  });
}

describe("authenticated inquiry message review route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.release.mockReturnValue(true);
    mocks.verifyAuth.mockResolvedValue(true);
    mocks.actor.mockResolvedValue("actor-1");
    mocks.access.mockResolvedValue(null);
    mocks.permission.mockResolvedValue(null);
    mocks.config.mockResolvedValue(config);
    mocks.prepare.mockResolvedValue(review);
    mocks.approve.mockResolvedValue({
      inquiryId: "inquiry-1",
      action: "reply",
      status: "accepted_unverified",
      reason: "provider read-back unavailable",
      retryable: true,
    });
  });

  it("keeps prepare and approve closed before authentication when release is disabled", async () => {
    mocks.release.mockReturnValue(false);
    expect((await POST(postRequest({ operation: "prepare" }))).status).toBe(503);
    expect((await POST(postRequest({ operation: "approve" }))).status).toBe(503);
    expect(mocks.verifyAuth).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it("requires an authenticated actor before reading tenant scope", async () => {
    mocks.verifyAuth.mockResolvedValue(false);
    const response = await POST(postRequest({ operation: "prepare", tenantId: "tenant-a", inquiryId: "inquiry-1", action: "reply" }));
    expect(response.status).toBe(401);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.config).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("requires same-origin JSON and membership before reading or sending", async () => {
    expect((await POST(postRequest({ operation: "prepare", tenantId: "tenant-a", inquiryId: "inquiry-1", action: "reply" }, { origin: "https://evil.invalid" }))).status).toBe(403);
    mocks.access.mockResolvedValue(new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }));
    expect((await POST(postRequest({ operation: "prepare", tenantId: "tenant-b", inquiryId: "inquiry-1", action: "reply" }))).status).toBe(403);
    expect(mocks.config).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("derives actor and business scope on prepare and ignores forged message fields", async () => {
    const response = await POST(postRequest({
      operation: "prepare",
      tenantId: "tenant-a",
      inquiryId: "inquiry-1",
      action: "reply",
      actorId: "attacker",
      recipient: "attacker@example.com",
      subject: "Forged subject",
      body: "Forged body",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ review });
    expect(mocks.permission).toHaveBeenCalledWith("tenant-a", "content:write");
    expect(mocks.prepare).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      businessId: "business-a",
      inquiryId: "inquiry-1",
      action: "reply",
      actorId: "actor-1",
    });
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it("requires permission before either operation", async () => {
    mocks.permission.mockResolvedValue(new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }));
    const response = await POST(postRequest({ operation: "prepare", tenantId: "tenant-a", inquiryId: "inquiry-1", action: "reply" }));
    expect(response.status).toBe(403);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("approves only the server-issued token and digest, and never retries an accepted-unverified write", async () => {
    const response = await POST(postRequest({
      operation: "approve",
      tenantId: "tenant-a",
      inquiryId: "inquiry-1",
      action: "reply",
      reviewToken: review.reviewToken,
      messageDigest: review.messageDigest,
      recipient: "attacker@example.com",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: {
      inquiryId: "inquiry-1",
      action: "reply",
      status: "accepted_unverified",
      reason: "provider read-back unavailable",
      retryable: false,
    } });
    expect(mocks.approve).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      businessId: "business-a",
      inquiryId: "inquiry-1",
      action: "reply",
      actorId: "actor-1",
      reviewToken: review.reviewToken,
      messageDigest: review.messageDigest,
    });
  });

  it("returns an honest conflict for a revoked or mismatched review", async () => {
    mocks.approve.mockRejectedValue(Object.assign(new Error("stale"), { code: "message_mismatch" }));
    const response = await POST(postRequest({
      operation: "approve",
      tenantId: "tenant-a",
      inquiryId: "inquiry-1",
      action: "reply",
      reviewToken: review.reviewToken,
      messageDigest: review.messageDigest,
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "The reviewed message changed. Prepare a fresh review before sending.",
      code: "message_mismatch",
    });
  });

  it("does not expose an incomplete review or an unknown delivery state", async () => {
    mocks.prepare.mockResolvedValue({ ...review, messageDigest: "not-a-digest" });
    const prepared = await POST(postRequest({ operation: "prepare", tenantId: "tenant-a", inquiryId: "inquiry-1", action: "reply" }));
    expect(prepared.status).toBe(503);
    expect((await prepared.json()).code).toBe("invalid_message_review");

    mocks.approve.mockResolvedValue({ inquiryId: "inquiry-1", action: "reply", status: "unknown", retryable: true });
    const approved = await POST(postRequest({
      operation: "approve",
      tenantId: "tenant-a",
      inquiryId: "inquiry-1",
      action: "reply",
      reviewToken: review.reviewToken,
      messageDigest: review.messageDigest,
    }));
    expect(approved.status).toBe(503);
    expect((await approved.json()).code).toBe("invalid_delivery_outcome");
  });

  it("rejects malformed operations before touching the delivery boundary", async () => {
    expect((await POST(postRequest({ tenantId: "tenant-a", inquiryId: "inquiry-1", action: "reply" }))).status).toBe(400);
    expect((await POST(postRequest({ operation: "approve", tenantId: "tenant-a", inquiryId: "inquiry-1", action: "reply", reviewToken: "x" }))).status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.approve).not.toHaveBeenCalled();
  });
});
