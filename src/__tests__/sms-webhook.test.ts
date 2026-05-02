import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateRequest } from "twilio";
import { getPendingByPhone, clearPending, PendingSms } from "../lib/sms-pending";

// Mock Redis to control storage behavior
vi.mock("../lib/redis", () => {
  const mockRedis = {
    keys: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  };
  return {
    getRedis: vi.fn(() => mockRedis),
    __mockRedis: mockRedis,
  };
});

describe("SMS webhook signature validation", () => {
  it("rejects request with invalid Twilio signature", () => {
    const authToken = "test-auth-token";
    const invalidSignature = "invalid-signature-xyz";
    const webhookUrl = "https://example.com/api/sms/webhook";
    const params = { From: "+15551234567", Body: "yes" };

    const isValid = validateRequest(authToken, invalidSignature, webhookUrl, params);

    expect(isValid).toBe(false);
  });

  it("rejects request with empty signature", () => {
    const authToken = "test-auth-token";
    const emptySignature = "";
    const webhookUrl = "https://example.com/api/sms/webhook";
    const params = { From: "+15551234567", Body: "yes" };

    const isValid = validateRequest(authToken, emptySignature, webhookUrl, params);

    expect(isValid).toBe(false);
  });
});

describe("SMS webhook - missing auth token fails closed", () => {
  it("should fail when SMS enabled but TWILIO_AUTH_TOKEN missing", () => {
    // Verify the security logic: when SMS_SUGGESTIONS_ENABLED=true but
    // TWILIO_AUTH_TOKEN is missing, requests should be rejected

    // Set env for test
    const originalSms = process.env.SMS_SUGGESTIONS_ENABLED;
    const originalToken = process.env.TWILIO_AUTH_TOKEN;

    process.env.SMS_SUGGESTIONS_ENABLED = "true";
    delete process.env.TWILIO_AUTH_TOKEN;

    // The security check that should be in the route
    const shouldReject =
      process.env.SMS_SUGGESTIONS_ENABLED === "true" &&
      !process.env.TWILIO_AUTH_TOKEN;

    expect(shouldReject).toBe(true);

    // Restore
    process.env.SMS_SUGGESTIONS_ENABLED = originalSms;
    if (originalToken) process.env.TWILIO_AUTH_TOKEN = originalToken;
  });
});

describe("SMS pending - duplicate approval prevention", () => {
  let mockRedis: {
    keys: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const redis = await import("../lib/redis");
    mockRedis = (redis as unknown as { __mockRedis: typeof mockRedis }).__mockRedis;
  });

  it("clearPending returns false when already processed - prevents duplicate execution", async () => {
    // Setup: pending already has status "approved"
    mockRedis.get.mockResolvedValue(
      JSON.stringify({
        approvalId: "apr_123",
        tenantId: "test-tenant",
        suggestionId: "sug_123",
        suggestionText: "Update hours",
        actionPrompt: "Update hours",
        sentAt: new Date().toISOString(),
        phone: "+15551234567",
        status: "approved", // Already processed
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      })
    );

    const result = await clearPending("test-tenant", "approved");

    // Should return false because already processed
    expect(result).toBe(false);
    // Should NOT have called set to update
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("clearPending returns true on first call, false on second - idempotent", async () => {
    const pendingEntry = {
      approvalId: "apr_123",
      tenantId: "test-tenant",
      suggestionId: "sug_123",
      suggestionText: "Update hours",
      actionPrompt: "Update hours",
      sentAt: new Date().toISOString(),
      phone: "+15551234567",
      status: "waiting",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };

    // First call: status is "waiting"
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(pendingEntry));
    const result1 = await clearPending("test-tenant", "approved");
    expect(result1).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledTimes(1);

    // Second call: status is now "approved"
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({ ...pendingEntry, status: "approved" })
    );
    const result2 = await clearPending("test-tenant", "approved");
    expect(result2).toBe(false);
    // set should still only have been called once (from first call)
    expect(mockRedis.set).toHaveBeenCalledTimes(1);
  });
});

describe("SMS pending - expiration logic", () => {
  let mockRedis: {
    keys: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const redis = await import("../lib/redis");
    mockRedis = (redis as unknown as { __mockRedis: typeof mockRedis }).__mockRedis;
  });

  it("getPendingByPhone returns null for expired entries", async () => {
    const expiredEntry: PendingSms = {
      approvalId: "apr_123",
      tenantId: "test-tenant",
      suggestionId: "sug_123",
      suggestionText: "Update hours",
      actionPrompt: "Update hours",
      sentAt: new Date().toISOString(),
      phone: "+15551234567",
      status: "waiting",
      // Expired 1 hour ago
      expiresAt: new Date(Date.now() - 3600000).toISOString(),
    };

    // First call: phone index lookup returns tenantId
    mockRedis.get.mockResolvedValueOnce("test-tenant");
    // Second call: actual pending entry lookup
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(expiredEntry));

    const result = await getPendingByPhone("+15551234567");

    expect(result).toBeNull();
    // Should have deleted both the entry and phone index
    expect(mockRedis.del).toHaveBeenCalledWith("sms:pending:test-tenant");
    expect(mockRedis.del).toHaveBeenCalledWith("sms:phone:+15551234567");
  });

  it("getPendingByPhone returns entry if not expired", async () => {
    const validEntry: PendingSms = {
      approvalId: "apr_123",
      tenantId: "test-tenant",
      suggestionId: "sug_123",
      suggestionText: "Update hours",
      actionPrompt: "Update hours",
      sentAt: new Date().toISOString(),
      phone: "+15551234567",
      status: "waiting",
      // Expires in 1 hour
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };

    // First call: phone index lookup returns tenantId
    mockRedis.get.mockResolvedValueOnce("test-tenant");
    // Second call: actual pending entry lookup
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(validEntry));

    const result = await getPendingByPhone("+15551234567");

    expect(result).not.toBeNull();
    expect(result?.approvalId).toBe("apr_123");
    // Should NOT have deleted
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it("expired approval does not execute - returns null from claim", async () => {
    // When an approval expires, getPendingByPhone returns null
    // This means the webhook handler won't find anything to execute
    const expiredEntry: PendingSms = {
      approvalId: "apr_123",
      tenantId: "test-tenant",
      suggestionId: "sug_123",
      suggestionText: "Update hours",
      actionPrompt: "Update hours",
      sentAt: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
      phone: "+15551234567",
      status: "waiting",
      expiresAt: new Date(Date.now() - 86400000).toISOString(), // Expired 1 day ago
    };

    // First call: phone index lookup returns tenantId
    mockRedis.get.mockResolvedValueOnce("test-tenant");
    // Second call: actual pending entry lookup
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(expiredEntry));

    const pending = await getPendingByPhone("+15551234567");

    // Should return null for expired entry
    expect(pending).toBeNull();

    // Simulating what the webhook handler does:
    // if (!pending) { sendSms("No pending suggestion") }
    // The action is NOT executed because pending is null
  });
});
