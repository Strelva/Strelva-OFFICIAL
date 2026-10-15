import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({ Resend: class { emails = { send }; batch = { send }; } }));

import { sendEmailWithReceipt, type SendEmailInput } from "@/platform/infra/email/send";
import { resetProviderKeyWarningsForTests } from "@/platform/connections/provider-keys";

const operatorMail = { audience: "operator", to: "ops@example.test", subject: "Hello", html: "<p>Hi</p>", text: "Hi" } as SendEmailInput;
const warned: string[] = [];

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("OPERATOR_EMAILS_ENABLED", "true");
  warned.length = 0;
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => { warned.push(args.join(" ")); });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); resetProviderKeyWarningsForTests(); });

describe("sending with no RESEND_API_KEY", () => {
  it("suppresses, logs the missing key once by name, and sends nothing", async () => {
    expect(await sendEmailWithReceipt(operatorMail)).toEqual({ status: "suppressed", reason: "email_suppressed_or_unconfigured" });
    expect(await sendEmailWithReceipt(operatorMail)).toEqual({ status: "suppressed", reason: "email_suppressed_or_unconfigured" });
    expect(warned.filter(line => line.includes("RESEND_API_KEY"))).toEqual(["[connections] resend not set up yet: missing RESEND_API_KEY"]);
    expect(send).not.toHaveBeenCalled();
  });

  it("changes no email switch: a disabled audience is still skipped before the key matters", async () => {
    vi.stubEnv("OPERATOR_EMAILS_ENABLED", "false");
    expect(await sendEmailWithReceipt(operatorMail)).toEqual({ status: "suppressed", reason: "email_suppressed_or_unconfigured" });
    expect(warned.some(line => line.includes("RESEND_API_KEY"))).toBe(false);
  });
});
