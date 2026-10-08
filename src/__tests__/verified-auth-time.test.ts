import { describe, expect, it } from "vitest";
import { verifiedAuthenticationTime } from "@/platform/infra/db/verified-auth-time";
const now = 1_791_388_800;
describe("verified authentication freshness", () => {
  it.each(["password", "oauth", "otp", "magiclink"])("reads a real %s sign-in event", method => {
    expect(verifiedAuthenticationTime({ amr: [{ method, timestamp: now - 5 }] }, now)).toBe(now - 5);
  });
  it("keeps a stale password time when a token refresh has a new issued-at and AMR time", () => {
    expect(verifiedAuthenticationTime({ iat: now, amr: [{ method: "password", timestamp: now - 601 }, { method: "token_refresh", timestamp: now }] }, now)).toBe(now - 601);
  });
  it.each(["token_refresh", "anonymous", "recovery", "invite", "email/signup", "email_change", "unknown", "totp"])("does not count %s as a new operator sign-in", method => {
    expect(verifiedAuthenticationTime({ amr: [{ method, timestamp: now }] }, now)).toBeNull();
  });
  it.each([now + 1, 0, -1, Infinity, NaN, "1791388800", now - 0.5])( "refuses invalid authentication timestamp %s", timestamp => {
    expect(verifiedAuthenticationTime({ amr: [{ method: "password", timestamp }] }, now)).toBeNull();
    expect(verifiedAuthenticationTime({ auth_time: timestamp, amr: [{ method: "password", timestamp: now }] }, now)).toBeNull();
  });
  it("uses the most recent qualified sign-in and preserves an explicit auth_time", () => {
    const amr = [{ method: "password", timestamp: now - 60 }, { method: "magiclink", timestamp: now - 5 }];
    expect(verifiedAuthenticationTime({ amr }, now)).toBe(now - 5);
    expect(verifiedAuthenticationTime({ auth_time: now - 1200, amr }, now)).toBe(now - 1200);
  });
  it.each([null, {}, { iat: now }, { amr: "password" }, { amr: [null, "password", { timestamp: now }] }])("fails closed with missing qualified claims", claims => {
    expect(verifiedAuthenticationTime(claims, now)).toBeNull();
  });
});
