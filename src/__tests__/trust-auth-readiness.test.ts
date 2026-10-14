import { afterEach, describe, expect, it, vi } from "vitest";
import { authEmailReady } from "@/components/auth/email-readiness";
import { signInErrorCopy } from "@/components/auth/sign-in-errors";

afterEach(() => vi.unstubAllEnvs());
describe("qualified Auth email", () => {
  it.each([undefined, "", "0", "true", "yes"])("fails closed for %s", value => {
    vi.stubEnv("STRELVA_AUTH_EMAIL_READY", value);
    expect(authEmailReady()).toBe(false);
  });
  it("opens only with the exact server switch", () => {
    vi.stubEnv("STRELVA_AUTH_EMAIL_READY", "1");
    expect(authEmailReady()).toBe(true);
  });
  it.each(["google", "email"] as const)("maps rate limits for %s", method => {
    expect(signInErrorCopy({ code: "over_request_rate_limit" }, method)).toContain("Wait a few minutes");
    expect(signInErrorCopy({ status: 429 }, method)).toContain("Wait a few minutes");
  });
  it("offers corrective copy without provider details", () => {
    expect(signInErrorCopy({ code: "email_address_invalid" }, "email")).toContain("valid email");
    expect(signInErrorCopy({ code: "unexpected_failure" }, "google")).toBe("Google sign-in is temporarily unavailable. Try again.");
  });
});
