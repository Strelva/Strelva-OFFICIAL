import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

import { sendEmail, type EmailAudience } from "@/lib/email/send";

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
});

afterEach(() => vi.unstubAllEnvs());

async function deliver(audience: EmailAudience) {
  return sendEmail({
    audience,
    to: "person@example.com",
    subject: "Subject",
    html: "<p>Hello</p>",
    text: "Hello",
  });
}

describe("email audience routing", () => {
  it("defaults operator and prospect on while client and customer stay off", async () => {
    expect(await deliver("client")).toBe(false);
    expect(await deliver("customer")).toBe(false);
    expect(await deliver("operator")).toBe(true);
    expect(await deliver("prospect")).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("honors each audience's independent switch", async () => {
    vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
    vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true");
    vi.stubEnv("OPERATOR_EMAILS_ENABLED", "false");
    vi.stubEnv("PROSPECT_EMAILS_ENABLED", "false");
    expect(await deliver("client")).toBe(true);
    expect(await deliver("customer")).toBe(true);
    expect(await deliver("operator")).toBe(false);
    expect(await deliver("prospect")).toBe(false);
  });
});
