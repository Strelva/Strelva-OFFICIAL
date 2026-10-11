import { expect, it } from "vitest";
import { localAuthFailure } from "../../tests/support/auth-diagnostic";
it("preserves database versus rate-limit failure evidence without Auth payloads", () => {
  for (const code of ["unexpected_failure", "over_email_send_rate_limit"]) {
    const error = localAuthFailure("create identity", { code, status: 500, message: "secret-password customer@example.test", cause: "secret-token" });
    expect(error.message).toBe(`Local Auth create identity failed: code=${code} status=500`);
    expect(error.cause).toBeUndefined();
  }
});
it("drops malformed diagnostic fields and never serializes the provider error", () => {
  const error = localAuthFailure("sign in", { code: "secret@example.test\npassword", status: "secret", message: "secret" });
  expect(error.message).toBe("Local Auth sign in failed: code=unavailable");
});
