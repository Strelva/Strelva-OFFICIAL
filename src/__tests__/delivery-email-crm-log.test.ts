import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CRM comms auto-log: when a client email ACTUALLY sends, it accrues into the
// tenant's CRM activity timeline. Invariants:
//  - only a real send logs (a paused/suppressed send must never be recorded),
//  - no tenantId → no log (backward-compatible for callers that don't opt in),
//  - fail-soft: a CRM-log failure never breaks the send.

const sendMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ data: { id: "m_1" }, error: null, headers: null })),
);
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const addActivityMock = vi.hoisted(() => vi.fn((..._a: unknown[]) => Promise.resolve()));
vi.mock("@/lib/tenant-crm", () => ({
  addTenantActivity: (...a: unknown[]) => addActivityMock(...a),
}));

describe("delivery-email CRM comms auto-log", () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    sendMock.mockClear();
    addActivityMock.mockClear();
    addActivityMock.mockResolvedValue(undefined);
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_DOMAIN = "updates.strelva.com";
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("logs a CRM 'email' activity when a real send goes out with a tenantId", async () => {
    process.env.EMAIL_SENDING_ENABLED = "true";
    const { sendWelcomeEmail } = await import("@/lib/delivery-email");

    const ok = await sendWelcomeEmail({
      email: "chelsea@example.com",
      businessName: "Rohlax Wellness",
      dashboardUrl: "https://admin.rohlax.com/dashboard",
      tenantId: "rohlax",
    });

    expect(ok).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(addActivityMock).toHaveBeenCalledTimes(1);
    expect(addActivityMock).toHaveBeenCalledWith("rohlax", {
      kind: "email",
      summary: "Sent: welcome email",
      author: "Strelva",
    });
  });

  it("does NOT log when the client email switch is paused (no real send)", async () => {
    delete process.env.EMAIL_SENDING_ENABLED; // prod default = paused
    const { sendReviewRequestEmail } = await import("@/lib/delivery-email");

    const ok = await sendReviewRequestEmail({
      email: "chelsea@example.com",
      businessName: "Rohlax Wellness",
      reviewUrl: "https://g.page/r/rohlax/review",
      tenantId: "rohlax",
    });

    expect(ok).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
    expect(addActivityMock).not.toHaveBeenCalled();
  });

  it("does NOT log when no tenantId is provided (opt-in)", async () => {
    process.env.EMAIL_SENDING_ENABLED = "true";
    const { sendSiteLiveEmail } = await import("@/lib/delivery-email");

    const ok = await sendSiteLiveEmail({
      email: "chelsea@example.com",
      businessName: "Rohlax Wellness",
      siteUrl: "https://rohlaxwellness.com",
      dashboardUrl: "https://admin.rohlax.com/dashboard",
    });

    expect(ok).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(addActivityMock).not.toHaveBeenCalled();
  });

  it("is fail-soft: a CRM-log throw never breaks the send", async () => {
    process.env.EMAIL_SENDING_ENABLED = "true";
    addActivityMock.mockRejectedValue(new Error("redis down"));
    const { sendWelcomeEmail } = await import("@/lib/delivery-email");

    const ok = await sendWelcomeEmail({
      email: "chelsea@example.com",
      businessName: "Rohlax Wellness",
      dashboardUrl: "https://admin.rohlax.com/dashboard",
      tenantId: "rohlax",
    });

    expect(ok).toBe(true); // the send still succeeds
    expect(addActivityMock).toHaveBeenCalledTimes(1);
  });
});
