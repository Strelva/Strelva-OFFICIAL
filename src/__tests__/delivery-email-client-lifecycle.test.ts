import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Client lifecycle senders (welcome / site-live / review-request). Each must:
//  - render through the SHARED email design system (never hand-rolled markup),
//  - be SILENCED when the client email kill-switch is paused,
//  - actually send when sending is enabled.

const sendMock = vi.hoisted(() =>
  vi.fn(
    (_payload: {
      from: string;
      to: string | string[];
      subject: string;
      html: string;
      text: string;
    }) => Promise.resolve({ data: { id: "m_1" }, error: null, headers: null }),
  ),
);
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

// A marker only the shared layout emits (the hosted logo lockup). If a sender
// hand-rolled its own HTML this would be absent — so it proves the design system.
const DESIGN_SYSTEM_MARKER = 'alt="Strelva"';

describe("client lifecycle emails render through the shared design system", () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    sendMock.mockClear();
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_DOMAIN = "updates.strelva.com";
    process.env.EMAIL_SENDING_ENABLED = "true";
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("sendWelcomeEmail renders branded content with the dashboard CTA", async () => {
    const { sendWelcomeEmail } = await import("@/lib/delivery-email");
    const ok = await sendWelcomeEmail({
      email: "chelsea@example.com",
      businessName: "Rohlax Wellness",
      ownerName: "Chelsea",
      dashboardUrl: "https://admin.rohlax.com/dashboard",
    });
    expect(ok).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.subject).toBe("Welcome to Strelva");
    expect(call.html).toContain(DESIGN_SYSTEM_MARKER);
    expect(call.html).toContain("Welcome to Strelva");
    expect(call.html).toContain("Chelsea");
    expect(call.html).toContain("Open your dashboard");
    expect(call.html).toContain("https://admin.rohlax.com/dashboard");
    expect(call.text).toContain("Welcome to Strelva");
    expect(call.text).toContain("Open your dashboard: https://admin.rohlax.com/dashboard");
  });

  it("sendSiteLiveEmail carries the live URL as a row and a View-your-site button", async () => {
    const { sendSiteLiveEmail } = await import("@/lib/delivery-email");
    const ok = await sendSiteLiveEmail({
      email: "chelsea@example.com",
      businessName: "Rohlax Wellness",
      siteUrl: "https://rohlaxwellness.com",
      dashboardUrl: "https://admin.rohlax.com/dashboard",
    });
    expect(ok).toBe(true);
    const call = sendMock.mock.calls[0][0];
    expect(call.subject).toBe("Rohlax Wellness is live");
    expect(call.html).toContain(DESIGN_SYSTEM_MARKER);
    expect(call.html).toContain("Your site is live");
    expect(call.html).toContain("Your site"); // the row label
    expect(call.html).toContain("https://rohlaxwellness.com");
    expect(call.html).toContain("View your site");
    // dashboardUrl surfaces as the footer Manage link.
    expect(call.html).toContain("https://admin.rohlax.com/dashboard");
  });

  it("sendReviewRequestEmail is a short nudge with the review link", async () => {
    const { sendReviewRequestEmail } = await import("@/lib/delivery-email");
    const ok = await sendReviewRequestEmail({
      email: "chelsea@example.com",
      businessName: "Rohlax Wellness",
      reviewUrl: "https://g.page/r/rohlax/review",
      ownerName: "Chelsea",
    });
    expect(ok).toBe(true);
    const call = sendMock.mock.calls[0][0];
    expect(call.subject).toBe("A few reviews go a long way for Rohlax Wellness");
    expect(call.html).toContain(DESIGN_SYSTEM_MARKER);
    expect(call.html).toContain("Open your review link");
    expect(call.html).toContain("https://g.page/r/rohlax/review");
  });
});

describe("client lifecycle emails obey the client kill-switch", () => {
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

  it("SILENCES every client sender when EMAIL_SENDING_ENABLED is not 'true'", async () => {
    delete process.env.EMAIL_SENDING_ENABLED; // prod default = paused
    const { sendWelcomeEmail, sendSiteLiveEmail, sendReviewRequestEmail } = await import(
      "@/lib/delivery-email"
    );

    expect(
      await sendWelcomeEmail({
        email: "a@example.com",
        businessName: "Rohlax Wellness",
        dashboardUrl: "https://admin.rohlax.com/dashboard",
      }),
    ).toBe(false);
    expect(
      await sendSiteLiveEmail({
        email: "a@example.com",
        businessName: "Rohlax Wellness",
        siteUrl: "https://rohlaxwellness.com",
        dashboardUrl: "https://admin.rohlax.com/dashboard",
      }),
    ).toBe(false);
    expect(
      await sendReviewRequestEmail({
        email: "a@example.com",
        businessName: "Rohlax Wellness",
        reviewUrl: "https://g.page/r/rohlax/review",
      }),
    ).toBe(false);

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("SENDS every client sender when EMAIL_SENDING_ENABLED='true'", async () => {
    process.env.EMAIL_SENDING_ENABLED = "true";
    const { sendWelcomeEmail, sendSiteLiveEmail, sendReviewRequestEmail } = await import(
      "@/lib/delivery-email"
    );

    expect(
      await sendWelcomeEmail({
        email: "a@example.com",
        businessName: "Rohlax Wellness",
        dashboardUrl: "https://admin.rohlax.com/dashboard",
      }),
    ).toBe(true);
    expect(
      await sendSiteLiveEmail({
        email: "a@example.com",
        businessName: "Rohlax Wellness",
        siteUrl: "https://rohlaxwellness.com",
        dashboardUrl: "https://admin.rohlax.com/dashboard",
      }),
    ).toBe(true);
    expect(
      await sendReviewRequestEmail({
        email: "a@example.com",
        businessName: "Rohlax Wellness",
        reviewUrl: "https://g.page/r/rohlax/review",
      }),
    ).toBe(true);

    expect(sendMock).toHaveBeenCalledTimes(3);
  });
});
