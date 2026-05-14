import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSendEmail = vi.hoisted(() => vi.fn());
const mockRedisStore = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/lib/rate-limit", () => ({
  isRateLimitedWindowedAsync: vi.fn(() => Promise.resolve(false)),
  rateLimitKey: vi.fn(() => "access-request-intake:test"),
}));

vi.mock("@/lib/redis", () => ({
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
      NEXT_PUBLIC_SITE_URL: "https://scaffoldweb.com",
      RESEND_API_KEY: "re_test",
      RESEND_DOMAIN: "updates.scaffoldweb.com",
    };
    mockSendEmail.mockResolvedValue({ data: { id: "email_123" }, error: null, headers: null });
  });

  it("creates a no-login delivery link and sends the first signup email", async () => {
    const { POST } = await import("@/app/api/access-request/intake/route");

    const response = await POST(new Request("http://localhost/api/access-request/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: "Demo Studio",
        email: "Owner@Example.com",
        location: "Buffalo, NY",
        currentWebsite: "https://example.com",
        description: "Free site signup. Site request: weekly proof",
        referredBy: "test",
      }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      emailSent: true,
    });
    expect(body.statusUrl).toMatch(/^https:\/\/scaffoldweb\.com\/delivery\/[a-f0-9]{36}$/);
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({
      from: "Scaffold Web <hello@updates.scaffoldweb.com>",
      to: "owner@example.com",
      subject: "We received Demo Studio's site request",
      html: expect.stringContaining("Track site delivery"),
      text: expect.stringContaining(`Track site delivery: ${body.statusUrl}`),
    }));
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({
      html: expect.stringContaining("No login is needed yet"),
      text: expect.stringContaining("No login is needed yet"),
    }));
  });

  it("does not report email delivery when Resend returns an API error", async () => {
    mockSendEmail.mockResolvedValueOnce({
      data: null,
      error: { message: "Domain is not verified", name: "validation_error" },
      headers: null,
    });
    const { POST } = await import("@/app/api/access-request/intake/route");

    const response = await POST(new Request("http://localhost/api/access-request/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: "Demo Studio",
        email: "owner@example.com",
        description: "Free site signup. Site request: weekly proof",
      }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      emailSent: false,
    });
    expect(body.statusUrl).toMatch(/^https:\/\/scaffoldweb\.com\/delivery\/[a-f0-9]{36}$/);
  });

  it("returns the existing status link for repeat email submissions", async () => {
    const { POST } = await import("@/app/api/access-request/intake/route");

    const firstResponse = await POST(new Request("http://localhost/api/access-request/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: "Demo Studio",
        email: "owner@example.com",
        description: "Free site signup. Site request: weekly proof",
      }),
    }));
    const firstBody = await firstResponse.json();

    mockSendEmail.mockClear();

    const repeatResponse = await POST(new Request("http://localhost/api/access-request/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: "Second Studio",
        email: "Owner@Example.com",
        description: "Free site signup. Site request: another site",
      }),
    }));

    expect(repeatResponse.status).toBe(200);
    const repeatBody = await repeatResponse.json();
    expect(repeatBody).toMatchObject({
      success: true,
      emailSent: false,
      repeatSubmission: true,
      statusUrl: firstBody.statusUrl,
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("renders safe email copy for business names and status URLs", async () => {
    const { buildDeliveryStatusEmailHtml, buildDeliveryStatusEmailText } = await import("@/lib/access-request-delivery");

    const html = buildDeliveryStatusEmailHtml({
      businessName: `A&B <script>alert("x")</script>`,
      statusUrl: `https://scaffoldweb.com/delivery/abc"><script>alert(1)</script>`,
    });
    const text = buildDeliveryStatusEmailText({
      businessName: "A&B\r\nBcc: attacker@example.com",
      statusUrl: "https://scaffoldweb.com/delivery/abc",
    });

    expect(html).toContain("A&amp;B alert(&quot;x&quot;)");
    expect(html).toContain("https://scaffoldweb.com/delivery/abc&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(text).toContain("A&B Bcc: attacker@example.com");
    expect(text).not.toContain("\r");
  });
});
