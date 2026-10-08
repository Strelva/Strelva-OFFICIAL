import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getUser: vi.fn(), getClaims: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }));
import { getSessionAuthContext } from "@/platform/infra/db/server-client";
const user = { id: "33333333-3333-4333-8333-333333333333", email: "operator@example.test", email_confirmed_at: "confirmed" };
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-fixture-key");
  auth.getUser.mockResolvedValue({ data: { user }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("browser authentication time", () => {
  it("uses the verified user's matching AMR sign-in event", async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 5;
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: user.id, amr: [{ method: "magiclink", timestamp }] } }, error: null });
    await expect(getSessionAuthContext()).resolves.toEqual({ user, authTime: timestamp });
  });
  it("does not authenticate a mismatched claims subject for step-up", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "another-user", auth_time: Math.floor(Date.now() / 1000) } }, error: null });
    await expect(getSessionAuthContext()).resolves.toEqual({ user, authTime: null });
  });
  it("retains the user but refuses freshness when claim verification fails", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: user.id, auth_time: Math.floor(Date.now() / 1000) } }, error: new Error("invalid signature") });
    await expect(getSessionAuthContext()).resolves.toEqual({ user, authTime: null });
  });
  it("returns no context when user verification fails", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid user") });
    await expect(getSessionAuthContext()).resolves.toBeNull();
    expect(auth.getClaims).not.toHaveBeenCalled();
  });
});
