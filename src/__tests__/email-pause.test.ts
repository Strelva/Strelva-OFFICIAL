import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Assert the global email kill-switch: when EMAIL_SENDING_ENABLED is not
// "true", no outbound email is sent. The prod default (unset) is paused.

const sendMock = vi.fn(() => Promise.resolve({ data: { id: "m_1" }, error: null }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

describe("email kill-switch (EMAIL_SENDING_ENABLED)", () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    sendMock.mockClear();
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_DOMAIN = "updates.strelva.com";
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("reports paused when the flag is not exactly 'true'", async () => {
    const { emailSendingEnabled, emailSendingPaused } = await import("@/lib/email-enabled");
    for (const v of [undefined, "", "false", "1", "yes", "TRUE"]) {
      if (v === undefined) delete process.env.EMAIL_SENDING_ENABLED;
      else process.env.EMAIL_SENDING_ENABLED = v;
      expect(emailSendingEnabled()).toBe(false);
      expect(emailSendingPaused()).toBe(true);
    }
    process.env.EMAIL_SENDING_ENABLED = "true";
    expect(emailSendingEnabled()).toBe(true);
    expect(emailSendingPaused()).toBe(false);
  });

  it("does NOT call Resend when paused", async () => {
    delete process.env.EMAIL_SENDING_ENABLED; // paused
    const { sendUpdateLiveEmail } = await import("@/lib/delivery-email");
    const ok = await sendUpdateLiveEmail({
      email: "chelsea@example.com",
      siteName: "Rohlax Wellness",
      whatChanged: "hours",
      siteUrl: "https://rohlax.example.com",
    });
    expect(ok).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("DOES call Resend when explicitly enabled", async () => {
    process.env.EMAIL_SENDING_ENABLED = "true";
    const { sendUpdateLiveEmail } = await import("@/lib/delivery-email");
    const ok = await sendUpdateLiveEmail({
      email: "chelsea@example.com",
      siteName: "Rohlax Wellness",
      whatChanged: "hours",
      siteUrl: "https://rohlax.example.com",
    });
    expect(ok).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
