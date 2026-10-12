import { describe, expect, it } from "vitest";
import { verifiedSignInTime, freshSignIn } from "@/platform/infra/db/auth-time";

const subject = "actual-verified-subject";
const time = 1_791_468_000;
describe("verified Supabase credential time", () => {
  it.each(["password", "oauth", "otp", "totp", "magiclink", "sso/saml"])("recognizes the signed %s AMR timestamp", method => {
    expect(verifiedSignInTime({ sub: subject, amr: [{ method, timestamp: time }] }, subject)).toBe(time);
  });
  it("keeps an older sign-in old after token refresh and issuance", () => {
    const now = new Date((time + 601) * 1000);
    const at = verifiedSignInTime({ sub: subject, iat: time + 601, amr: [{ method: "password", timestamp: time }, { method: "token_refresh", timestamp: time + 601 }] }, subject);
    expect(at).toBe(time);
    expect(freshSignIn(at, now)).toBe(false);
    expect(freshSignIn(at, new Date((time + 600) * 1000))).toBe(true);
  });
  it.each(["token_refresh", "anonymous", "recovery", "email/signup", "email_change", "invite", "unknown"])("refuses %s as credential reauthentication", method => {
    expect(verifiedSignInTime({ sub: subject, iat: time, amr: [{ method, timestamp: time }] }, subject)).toBeNull();
  });
  it("requires the same verified subject and fails closed on malformed or missing evidence", () => {
    for (const claims of [{ sub: "another", auth_time: time }, { auth_time: time }, { sub: subject, iat: time }, { sub: subject, amr: [{ method: "password", timestamp: "fresh" }] }, { sub: subject, auth_time: "fresh", amr: [{ method: "password", timestamp: time }] }]) expect(verifiedSignInTime(claims, subject)).toBeNull();
  });
  it("preserves explicit signed auth_time, and a later actual MFA check", () => {
    expect(verifiedSignInTime({ sub: subject, auth_time: time, amr: [{ method: "totp", timestamp: time + 10 }] }, subject)).toBe(time);
    expect(verifiedSignInTime({ sub: subject, amr: [{ method: "password", timestamp: time }, { method: "totp", timestamp: time + 10 }] }, subject)).toBe(time + 10);
  });
  it("does not accept future timestamps as fresh", () => {
    const at = verifiedSignInTime({ sub: subject, amr: [{ method: "password", timestamp: time + 1 }] }, subject);
    expect(freshSignIn(at, new Date(time * 1000))).toBe(false);
  });
});
