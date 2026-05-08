import { describe, expect, it, vi } from "vitest";
import { createOAuthState, verifyOAuthState } from "../lib/oauth-state";

describe("OAuth state signing", () => {
  it("accepts signed, unexpired OAuth state", () => {
    vi.stubEnv("INTERNAL_API_SECRET", "test-oauth-secret");
    const state = createOAuthState("gldf", 1_000);

    expect(verifyOAuthState(state, 1_500)).toEqual({ tenantId: "gldf" });

    vi.unstubAllEnvs();
  });

  it("rejects tampered OAuth state", () => {
    vi.stubEnv("INTERNAL_API_SECRET", "test-oauth-secret");
    const state = createOAuthState("gldf", 1_000);
    const [payload, signature] = state.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ tenantId: "victim", exp: 999_999, nonce: "nonce" }),
    ).toString("base64url");

    expect(verifyOAuthState(`${tamperedPayload}.${signature}`, 1_500)).toBeNull();
    expect(verifyOAuthState(`${payload}.invalid`, 1_500)).toBeNull();

    vi.unstubAllEnvs();
  });

  it("rejects expired OAuth state", () => {
    vi.stubEnv("INTERNAL_API_SECRET", "test-oauth-secret");
    const state = createOAuthState("gldf", 1_000);

    expect(verifyOAuthState(state, 11 * 60 * 1000)).toBeNull();

    vi.unstubAllEnvs();
  });
});
