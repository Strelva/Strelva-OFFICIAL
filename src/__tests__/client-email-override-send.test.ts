import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// sendEmail's "client" audience must respect a per-tenant override while
// operator/prospect stay unaffected: override "on" sends even when the global
// switch is paused; "off" blocks even when global is on; "inherit" / no tenant
// follows the global switch.

const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const mockGetClientEmailOverride = vi.hoisted(() => vi.fn());
vi.mock("@/lib/client-email-override", () => ({
  getClientEmailOverride: mockGetClientEmailOverride,
}));

import { sendEmail } from "@/lib/email/send";

const ENV_KEYS = [
  "EMAIL_SENDING_ENABLED",
  "OPERATOR_EMAILS_ENABLED",
  "PROSPECT_EMAILS_ENABLED",
  "CUSTOMER_EMAIL_ENABLED",
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  for (const key of ENV_KEYS) vi.stubEnv(key, "");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  send.mockResolvedValue({ data: { id: "mail_1" }, error: null });
  mockGetClientEmailOverride.mockResolvedValue("inherit");
});

afterEach(() => vi.unstubAllEnvs());

function clientTo(tenantId?: string) {
  return sendEmail({
    audience: "client",
    tenantId,
    to: "owner@example.com",
    subject: "Subject",
    html: "<p>Hello</p>",
    text: "Hello",
  });
}

describe("sendEmail client-audience tenant override", () => {
  it("override 'on' sends even when the global client switch is paused", async () => {
    // global paused (default), override armed
    mockGetClientEmailOverride.mockResolvedValue("on");
    expect(await clientTo("armed-tenant")).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(mockGetClientEmailOverride).toHaveBeenCalledWith("armed-tenant");
  });

  it("override 'off' blocks even when the global client switch is on", async () => {
    vi.stubEnv("EMAIL_SENDING_ENABLED", "true"); // global on
    mockGetClientEmailOverride.mockResolvedValue("off");
    expect(await clientTo("silenced-tenant")).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("override 'inherit' follows the global switch — paused blocks, on sends", async () => {
    mockGetClientEmailOverride.mockResolvedValue("inherit");
    // global paused
    expect(await clientTo("normal-tenant")).toBe(false);
    expect(send).not.toHaveBeenCalled();

    vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
    expect(await clientTo("normal-tenant")).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("without a tenantId, client email follows the global switch (override never consulted)", async () => {
    // global paused
    expect(await clientTo(undefined)).toBe(false);
    expect(mockGetClientEmailOverride).not.toHaveBeenCalled();

    vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
    expect(await clientTo(undefined)).toBe(true);
    expect(mockGetClientEmailOverride).not.toHaveBeenCalled();
  });

  it("operator + prospect are unaffected by a client override (default on, no override read)", async () => {
    // Even with a client override that would block, operator/prospect send.
    mockGetClientEmailOverride.mockResolvedValue("off");
    const operator = await sendEmail({
      audience: "operator",
      tenantId: "some-tenant",
      to: "jacob@strelva.com",
      subject: "Op",
      html: "<p>x</p>",
      text: "x",
    });
    const prospect = await sendEmail({
      audience: "prospect",
      tenantId: "some-tenant",
      to: "dana@acme.example.com",
      subject: "Pr",
      html: "<p>x</p>",
      text: "x",
    });
    expect(operator).toBe(true);
    expect(prospect).toBe(true);
    expect(mockGetClientEmailOverride).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
  });
});
