import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", () => ({
  isRateLimitedWindowedAsync: vi.fn(() => Promise.resolve(false)),
  rateLimitKey: vi.fn(() => "access-request-intake:test"),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(() => null),
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
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SANITY_PROJECT_ID: "",
      SANITY_API_TOKEN: "",
      NEXT_PUBLIC_SITE_URL: "https://scaffoldweb.com",
      RESEND_API_KEY: "re_test",
      RESEND_DOMAIN: "updates.scaffoldweb.com",
    };
    mockSendEmail.mockResolvedValue({ id: "email_123" });
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
        description: "Free website waitlist. First workflow: weekly proof",
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
