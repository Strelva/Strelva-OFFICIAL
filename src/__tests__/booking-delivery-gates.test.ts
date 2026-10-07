import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), override: vi.fn() }));
vi.mock("@/platform/infra/email/send", () => ({ sendEmailWithReceipt: mocks.send }));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: mocks.override }));
import { bookingLifecyclePorts } from "@/platform/bookings/lifecycle-ports";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
  vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true");
  mocks.override.mockResolvedValue("inherit");
  mocks.send.mockResolvedValue({ status: "accepted", providerMessageId: "fixture", acceptedAt: "now" });
});
afterEach(() => vi.unstubAllEnvs());

describe("real booking lifecycle email boundary", () => {
  it.each(["client", "customer"] as const)("requires all email gates for %s reminders", async audience => {
    const input = { audience, tenantId: "fixture", to: "dana@example.test", subject: "Fixture reminder" };
    for (const flag of ["EMAIL_SENDING_ENABLED", "CUSTOMER_EMAIL_ENABLED"]) {
      vi.stubEnv(flag, "false");
      expect(await bookingLifecyclePorts.send(input)).toEqual({ status: "suppressed", reason: "email_gates" });
      vi.stubEnv(flag, "true");
    }
    mocks.override.mockResolvedValue("off");
    expect(await bookingLifecyclePorts.send(input)).toEqual({ status: "suppressed", reason: "email_gates" });
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.override.mockResolvedValue("inherit");
    expect(await bookingLifecyclePorts.send(input)).toMatchObject({ status: "accepted" });
    expect(mocks.send).toHaveBeenCalledWith(input);
  });
});
