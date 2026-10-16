import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({ verifyOtp: vi.fn(), setAll: null as null | ((cookies: { name: string; value: string; options: Record<string, unknown> }[]) => void) }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, config: { cookies: { setAll: typeof supabase.setAll } }) => {
    supabase.setAll = config.cookies.setAll;
    return { auth: { verifyOtp: supabase.verifyOtp } };
  },
}));

function post(body: unknown) {
  return new NextRequest("https://app.strelva.com/auth/code", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

describe("email code sign-in", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://auth.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-fixture");
    supabase.verifyOtp.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("refuses malformed input before reaching Auth", async () => {
    const { POST } = await import("@/app/auth/code/route");
    for (const body of [{ email: "nobody", code: "123456" }, { email: "owner@example.test", code: "12ab56" }, { email: "owner@example.test", code: "123" }, null]) {
      const response = await POST(post(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ ok: false, reason: "invalid" });
    }
    expect(supabase.verifyOtp).not.toHaveBeenCalled();
  });

  it("verifies the code, writes host-only session cookies and continues to a same-origin path", async () => {
    supabase.verifyOtp.mockImplementation(async () => {
      supabase.setAll?.([{ name: "sb-access-token", value: "session", options: { domain: ".strelva.com", path: "/" } }]);
      return { error: null };
    });
    const { POST } = await import("@/app/auth/code/route");
    const response = await POST(post({ email: " Owner@Example.test ", code: "482 913", next: "/workspace?save=scan_public123" }));
    expect(supabase.verifyOtp).toHaveBeenCalledWith({ email: "owner@example.test", token: "482913", type: "email" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, next: "/workspace?save=scan_public123" });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("sb-access-token=session");
    expect(cookie.toLowerCase()).not.toContain("domain=");
  });

  it("never continues off-origin", async () => {
    supabase.verifyOtp.mockResolvedValue({ error: null });
    const { POST } = await import("@/app/auth/code/route");
    for (const next of ["//evil.example", "https://evil.example", "/\\evil"]) {
      const response = await POST(post({ email: "owner@example.test", code: "482913", next }));
      expect((await response.json()).next).toBe("/account");
    }
  });

  it.each([
    [{ code: "otp_expired", status: 403 }, 400, "expired"],
    [{ code: "over_request_rate_limit", status: 429 }, 429, "rate_limited"],
    [{ code: "invalid_credentials", status: 400, message: "private provider detail" }, 400, "invalid"],
  ])("maps a refused code without echoing the provider (%o)", async (error, status, reason) => {
    supabase.verifyOtp.mockResolvedValue({ error });
    const { POST } = await import("@/app/auth/code/route");
    const response = await POST(post({ email: "owner@example.test", code: "482913", next: "/workspace" }));
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body).toEqual({ ok: false, reason });
    expect(JSON.stringify(body)).not.toContain("private provider detail");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("fails closed when Auth is not configured or throws", async () => {
    const { POST } = await import("@/app/auth/code/route");
    supabase.verifyOtp.mockRejectedValue(new Error("network"));
    expect((await POST(post({ email: "owner@example.test", code: "482913" }))).status).toBe(503);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect((await POST(post({ email: "owner@example.test", code: "482913" }))).status).toBe(503);
  });
});
