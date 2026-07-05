import { beforeAll, describe, expect, it } from "vitest";
import {
  signApproveToken,
  verifyApproveToken,
  buildApproveUrl,
} from "@/lib/approve-link";

// The approve-link signer binds {eventId, tenantId, action} + an expiry under an
// HMAC. These tests pin the security contract: a valid token round-trips, and any
// tamper (payload, signature) or expiry is rejected.

beforeAll(() => {
  process.env.APPROVE_LINK_SECRET = "test-approve-secret";
});

const claims = { eventId: "evt_1", tenantId: "gldf", action: "approve" as const };

describe("approve-link", () => {
  it("round-trips a valid token", () => {
    const token = signApproveToken(claims);
    expect(verifyApproveToken(token)).toEqual(claims);
  });

  it("binds the action into the signature (not-yet ≠ approve)", () => {
    const notYet = signApproveToken({ ...claims, action: "not-yet" });
    expect(verifyApproveToken(notYet)).toEqual({ ...claims, action: "not-yet" });
  });

  it("rejects a tampered payload (eventId swapped)", () => {
    const token = signApproveToken(claims);
    const [, sig] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...claims, exp: Date.now() + 100000 }),
    ).toString("base64url");
    // Different tenant/event but re-using the original signature.
    const forged = `${forgedPayload}.${sig}`;
    expect(verifyApproveToken(forged)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = signApproveToken(claims);
    const [payload] = token.split(".");
    expect(verifyApproveToken(`${payload}.deadbeef`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const past = Date.now() - 20 * 24 * 60 * 60 * 1000; // signed 20 days ago
    const token = signApproveToken(claims, past);
    expect(verifyApproveToken(token)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyApproveToken("garbage")).toBeNull();
    expect(verifyApproveToken("")).toBeNull();
  });

  it("builds an absolute /api/approve URL with a verifiable token", () => {
    const url = buildApproveUrl("https://admin.gldf.strelva.com/", claims);
    expect(url.startsWith("https://admin.gldf.strelva.com/api/approve?token=")).toBe(true);
    const token = decodeURIComponent(new URL(url).searchParams.get("token")!);
    expect(verifyApproveToken(token)).toEqual(claims);
  });
});
