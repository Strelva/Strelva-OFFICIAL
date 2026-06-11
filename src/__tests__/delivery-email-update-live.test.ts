import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: vi.fn(function Resend() {
    return {
      emails: {
        send: mockSendEmail,
      },
    };
  }),
}));

describe("sendUpdateLiveEmail rollingOut soft variant", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = {
      ...originalEnv,
      RESEND_API_KEY: "re_test",
      RESEND_DOMAIN: "updates.strelva.com",
    };
    mockSendEmail.mockResolvedValue({ data: { id: "email_123" }, error: null, headers: null });
  });

  it("claims the change is LIVE when revalidation confirmed (rollingOut unset)", async () => {
    const { sendUpdateLiveEmail } = await import("@/lib/delivery-email");

    const ok = await sendUpdateLiveEmail({
      email: "owner@example.com",
      siteName: "Rohlax Wellness",
      whatChanged: "your hours",
      siteUrl: "https://rohlaxwellness.com",
    });

    expect(ok).toBe(true);
    const sent = mockSendEmail.mock.calls[0][0];
    expect(sent.subject).toBe("Your update to Rohlax Wellness is live");
    expect(sent.html).toContain("Your update is live.");
    expect(sent.html).toContain("live for visitors right now");
    expect(sent.text).toContain("Your update is live.");
    expect(sent.text).toContain("live for visitors right now");
  });

  it("softens the claim to ROLLING OUT when revalidation did not confirm", async () => {
    const { sendUpdateLiveEmail } = await import("@/lib/delivery-email");

    const ok = await sendUpdateLiveEmail({
      email: "owner@example.com",
      siteName: "Rohlax Wellness",
      whatChanged: "your hours",
      siteUrl: "https://rohlaxwellness.com",
      rollingOut: true,
    });

    expect(ok).toBe(true);
    const sent = mockSendEmail.mock.calls[0][0];
    expect(sent.subject).toBe("Your update to Rohlax Wellness is rolling out");
    expect(sent.html).toContain("Your update is approved.");
    expect(sent.html).toContain("it can take a few minutes to appear");
    // Must NOT promise it's live when it might not be.
    expect(sent.html).not.toContain("live for visitors right now");
    expect(sent.text).toContain("it can take a few minutes to appear");
    expect(sent.text).not.toContain("live for visitors right now");
  });
});
