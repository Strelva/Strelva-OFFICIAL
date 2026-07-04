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
      NEXT_PUBLIC_SITE_URL: "https://strelva.com",
      RESEND_API_KEY: "re_test",
      RESEND_DOMAIN: "updates.strelva.com",
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
        description: "Build request: weekly proof",
        referredBy: "test",
      }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      emailSent: true,
    });
    expect(body.statusUrl).toMatch(/^https:\/\/strelva\.com\/delivery\/[a-f0-9]{36}$/);
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({
      from: "Strelva <hello@updates.strelva.com>",
      to: "owner@example.com",
      subject: "We received Demo Studio's site request",
      html: expect.stringContaining(`href="${body.statusUrl}"`),
      text: expect.stringContaining(`Track your request: ${body.statusUrl}`),
    }));
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({
      html: expect.stringContaining("No login is needed yet"),
      text: expect.stringContaining("No login is needed yet"),
    }));
  });

  it("forwards phone and the door qualifier into the Slack build alert", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.test/abc";
    const slackFetch = vi.fn(
      (_url: string, _init: { method: string; body: string }) =>
        Promise.resolve(new Response(null, { status: 200 })),
    );
    vi.stubGlobal("fetch", slackFetch);

    const { POST } = await import("@/app/api/access-request/intake/route");

    const response = await POST(new Request("http://localhost/api/access-request/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: "Demo Studio",
        email: "owner@example.com",
        phone: "(716) 555-0100",
        plan: "one-time",
        description: "Build request: weekly proof",
      }),
    }));

    expect(response.status).toBe(200);
    expect(slackFetch).toHaveBeenCalledWith(
      "https://hooks.slack.test/abc",
      expect.objectContaining({ method: "POST" }),
    );
    const slackInit = slackFetch.mock.calls[0]?.[1];
    const slackBody = JSON.parse(slackInit?.body ?? "{}");
    expect(slackBody.text).toContain("New website build request");
    expect(slackBody.text).toContain("Phone: (716) 555-0100");
    expect(slackBody.text).toContain("Wants: One-time build");

    vi.unstubAllGlobals();
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
        description: "Build request: weekly proof",
      }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      emailSent: false,
    });
    expect(body.statusUrl).toMatch(/^https:\/\/strelva\.com\/delivery\/[a-f0-9]{36}$/);
  });

  it("returns the existing status link for repeat email submissions", async () => {
    const { POST } = await import("@/app/api/access-request/intake/route");

    const firstResponse = await POST(new Request("http://localhost/api/access-request/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: "Demo Studio",
        email: "owner@example.com",
        description: "Build request: weekly proof",
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
        description: "Build request: another site",
      }),
    }));

    expect(repeatResponse.status).toBe(200);
    const repeatBody = await repeatResponse.json();
    expect(repeatBody).toMatchObject({
      success: true,
      emailSent: true,
      repeatSubmission: true,
      statusUrl: firstBody.statusUrl,
    });
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "owner@example.com",
      html: expect.stringContaining(`href="${firstBody.statusUrl}"`),
      text: expect.stringContaining(`Track your request: ${firstBody.statusUrl}`),
    }));
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
