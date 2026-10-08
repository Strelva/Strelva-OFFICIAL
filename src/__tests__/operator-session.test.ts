import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getUser: vi.fn(), getClaims: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth }) }));
vi.mock("node:os", () => ({ hostname: () => "fixture-machine" }));

import { readOperatorSessionFromEnv } from "../../scripts/operator-session";

const USER_ID = "33333333-3333-4333-8333-333333333333";
const env = {
  STRELVA_OPERATOR_SESSION_ACCESS_TOKEN: "signed-session-token",
  SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-test-key",
  USER: "jacob",
  NODE_ENV: "test",
} as NodeJS.ProcessEnv;

afterEach(() => { auth.getUser.mockReset(); auth.getClaims.mockReset(); });

describe("CLI operator session", () => {
  it("reads the verified Supabase password authentication time when auth_time is absent", async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 5;
    auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "operator@example.test", email_confirmed_at: "confirmed" } }, error: null });
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: USER_ID, amr: [{ method: "password", timestamp }] } }, error: null });
    await expect(readOperatorSessionFromEnv(env)).resolves.toMatchObject({ authTime: timestamp });
  });
  it("verifies the signed token and records its user plus machine context", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "Operator@Example.test", email_confirmed_at: "confirmed" } }, error: null });
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: USER_ID, auth_time: 1_791_388_800 } }, error: null });
    await expect(readOperatorSessionFromEnv(env)).resolves.toEqual({
      userId: USER_ID, verifiedEmail: "operator@example.test", authTime: 1_791_388_800,
      auditContext: { source: "cli", osUser: "jacob", machine: "fixture-machine" },
    });
    expect(auth.getUser).toHaveBeenCalledWith("signed-session-token");
    expect(auth.getClaims).toHaveBeenCalledWith("signed-session-token");
  });

  it("rejects a token whose verified user does not match the signed subject", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "operator@example.test", email_confirmed_at: "confirmed" } }, error: null });
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "different-user", auth_time: 1_791_388_800 } }, error: null });
    await expect(readOperatorSessionFromEnv(env)).rejects.toThrow(/verified signed-in Strelva operator/);
  });

  it("requires a signed-in token rather than a typed operator address", async () => {
    await expect(readOperatorSessionFromEnv({ ...env, STRELVA_OPERATOR_SESSION_ACCESS_TOKEN: undefined })).rejects.toThrow(/STRELVA_OPERATOR_SESSION_ACCESS_TOKEN/);
  });
});
