import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSendEmail = vi.hoisted(() => vi.fn());
const mockRedisStore = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/platform/infra/rate-limit", () => ({
  isRateLimitedWindowedAsync: vi.fn(() => Promise.resolve(false)),
  rateLimitKey: vi.fn(() => "access-request-intake:test"),
}));

vi.mock("@/platform/infra/redis", () => ({
  getRedis: vi.fn(() => ({
    get: vi.fn((key: string) => Promise.resolve(mockRedisStore.get(key) ?? null)),
    set: vi.fn((key: string, value: unknown) => {
      mockRedisStore.set(key, value);
      return Promise.resolve("OK");
    }),
    zadd: vi.fn(() => Promise.resolve(1)),
  })),
}));

vi.mock("resend", () => ({
  Resend: vi.fn(function Resend() {
    return {
      emails: {
        send: mockSendEmail,
      },
    };
  }),
}));

describe("access request delivery flow", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRedisStore.clear();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SANITY_PROJECT_ID: "",
      SANITY_API_TOKEN: "",
      NEXT_PUBLIC_APP_URL: "https://app.strelva.com",
      RESEND_API_KEY: "re_test",
      RESEND_DOMAIN: "updates.strelva.com",
    };
    mockSendEmail.mockResolvedValue({ data: { id: "email_123" }, error: null, headers: null });
  });

  afterEach(() => { process.env = { ...originalEnv }; vi.unstubAllGlobals(); });

  it.each([["business_access", "/sign-up"], ["agency_access", "/sign-up?as=agency"]])("routes %s to platform entry without sales storage or notifications", async (requestType, next) => {
    const { POST } = await import("@/app/api/access-request/intake/route");
    const res = await POST(new Request("http://localhost/api/access-request/intake", { method: "POST", body: JSON.stringify({ requestType, email: "already@example.invalid" }) }));
    expect(res.status).toBe(200); expect(await res.json()).toEqual({ success: true, requestType, next });
    expect(mockRedisStore.size).toBe(0); expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it.each([undefined, "website", "agency_service_unconfirmed"])("rejects an unchosen/unknown sales path: %s", async requestType => {
    const { POST } = await import("@/app/api/access-request/intake/route");
    const res = await POST(new Request("http://localhost/api/access-request/intake", { method: "POST", body: JSON.stringify({ requestType, businessName: "Demo", email: "owner@example.invalid" }) }));
    expect(res.status).toBe(400); expect(mockRedisStore.size).toBe(0); expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it.each(["11111111-1111-4111-8111-111111111111", ""])("refuses anonymous agency assignment even with legacy configuration (%s)", async configured => {
    process.env.STRELVA_AGENCY_WORKSPACE_ID = configured;
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.example.test/fictional";
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const { getRedis } = await import("@/platform/infra/redis");
    const { POST } = await import("@/app/api/access-request/intake/route");
    const response = await POST(new Request("http://localhost/api/access-request/intake", { method: "POST", body: JSON.stringify({
      requestType: "agency_service", businessName: "Northside Bakery", email: "owner@bakery.example",
      agencyWorkspaceId: "22222222-2222-4222-8222-222222222222",
    }) }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: expect.stringContaining("No request was sent"), next: "/agencies", signIn: "/sign-up" });
    expect(mockRedisStore.size).toBe(0); expect(getRedis).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves existing delivery records without revealing or resending their private status links", async () => {
    mockRedisStore.set("lead:owner@bakery.example", { statusToken: "a".repeat(36) });
    const { POST } = await import("@/app/api/access-request/intake/route");
    const response = await POST(new Request("http://localhost/api/access-request/intake", { method: "POST", body: JSON.stringify({ requestType: "agency_service", email: "owner@bakery.example" }) }));
    expect(response.status).toBe(409); expect(await response.json()).not.toHaveProperty("statusUrl");
    expect(mockRedisStore.get("lead:owner@bakery.example")).toEqual({ statusToken: "a".repeat(36) });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
  it("retains rate limiting and invalid-body refusal", async () => {
    const { POST } = await import("@/app/api/access-request/intake/route");
    expect((await POST(new Request("http://localhost/api/access-request/intake", { method: "POST", body: "{" }))).status).toBe(400);
    const { isRateLimitedWindowedAsync } = await import("@/platform/infra/rate-limit");
    vi.mocked(isRateLimitedWindowedAsync).mockResolvedValueOnce(true);
    expect((await POST(new Request("http://localhost/api/access-request/intake", { method: "POST", body: "{}" }))).status).toBe(429);
    expect(mockRedisStore.size).toBe(0); expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("renders safe email copy for business names and status URLs", async () => {
    const { buildDeliveryStatusEmailHtml, buildDeliveryStatusEmailText } = await import("@/lib/access-request-delivery");

    const html = buildDeliveryStatusEmailHtml({
      businessName: `A&B <script>alert("x")</script>`,
      statusUrl: `https://strelva.com/delivery/abc"><script>alert(1)</script>`,
    });
    const text = buildDeliveryStatusEmailText({
      businessName: "A&B\r\nBcc: attacker@example.com",
      statusUrl: "https://strelva.com/delivery/abc",
    });

    expect(html).toContain("We&#39;ve got your request");
    expect(html).toContain("A&amp;B alert(&quot;x&quot;)");
    expect(html).toContain("https://strelva.com/delivery/abc&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Track your request");
    expect(html).not.toContain("<script>");
    expect(text).toContain("We've got your request");
    expect(text).toContain("A&B Bcc: attacker@example.com");
    expect(text).not.toContain("\r");
  });
});
