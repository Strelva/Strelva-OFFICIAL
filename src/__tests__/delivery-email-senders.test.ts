import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The two new senders added in the Track A hardening sprint:
 *  - sendBookingConfirmation — end-customer transactional, behind CUSTOMER_EMAIL_ENABLED (default off).
 *  - sendPaymentPastDueEmail — client dunning, behind the EMAIL_SENDING_ENABLED client gate (off in prod).
 * Both must fail soft (never throw) and only send when their gate + an API key are present.
 */

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
    constructor(_key: string) {}
  },
}));

import { sendBookingConfirmation, sendPaymentPastDueEmail } from "@/lib/delivery-email";

const SAVED = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  send.mockResolvedValue({ data: { id: "email_1" }, error: null });
  delete process.env.CUSTOMER_EMAIL_ENABLED;
  delete process.env.EMAIL_SENDING_ENABLED;
  delete process.env.RESEND_API_KEY;
});
afterEach(() => {
  process.env = { ...SAVED };
});

const booking = {
  to: "customer@example.com",
  clientName: "Dana",
  serviceName: "Reformer Pilates",
  date: "2026-07-14",
  time: "09:00",
  businessName: "Cove Wellness",
};

describe("sendBookingConfirmation (end-customer gate)", () => {
  it("does not send when CUSTOMER_EMAIL_ENABLED is unset (default off)", async () => {
    process.env.RESEND_API_KEY = "key";
    expect(await sendBookingConfirmation(booking)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("does not send (fail-soft) when enabled but no API key", async () => {
    process.env.CUSTOMER_EMAIL_ENABLED = "true";
    expect(await sendBookingConfirmation(booking)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends to the customer with the booking details when enabled + keyed", async () => {
    process.env.CUSTOMER_EMAIL_ENABLED = "true";
    process.env.RESEND_API_KEY = "key";
    expect(await sendBookingConfirmation(booking)).toBe(true);
    const arg = send.mock.calls[0]![0];
    expect(arg.to).toBe("customer@example.com");
    expect(arg.from).toContain("Cove Wellness");
    expect(arg.html).toContain("Reformer Pilates");
    expect(arg.text).toContain("Cove Wellness");
  });

  it("returns false (never throws) when Resend errors", async () => {
    process.env.CUSTOMER_EMAIL_ENABLED = "true";
    process.env.RESEND_API_KEY = "key";
    send.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await sendBookingConfirmation(booking)).toBe(false);
  });
});

describe("sendPaymentPastDueEmail (client dunning gate)", () => {
  const dunning = {
    email: "owner@studio.com",
    businessName: "Cove Wellness",
    dashboardUrl: "https://admin.cove.strelva.com/dashboard",
  };

  it("does not send when EMAIL_SENDING_ENABLED is unset (client mail paused)", async () => {
    process.env.RESEND_API_KEY = "key";
    expect(await sendPaymentPastDueEmail(dunning)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends to the owner with dunning copy when enabled + keyed", async () => {
    process.env.EMAIL_SENDING_ENABLED = "true";
    process.env.RESEND_API_KEY = "key";
    expect(await sendPaymentPastDueEmail(dunning)).toBe(true);
    const arg = send.mock.calls[0]![0];
    expect(arg.to).toBe("owner@studio.com");
    expect(arg.text).toContain("didn't go through"); // plain text isn't HTML-escaped
    expect(arg.html).toContain("Cove Wellness");
  });
});
