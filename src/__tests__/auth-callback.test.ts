import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Supabase auth callback continuation", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("keeps an invitation claim wrapper when a provider callback fails", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const target = "/workspace?save=scan_public123";
    const request = new NextRequest(
      `https://app.strelva.com/auth/callback?error=access_denied&next=${encodeURIComponent(`/account?next=${encodeURIComponent(target)}`)}`,
    );

    const response = await GET(request);
    const location = response.headers.get("location");

    expect(location).toBe(
      `https://app.strelva.com/sign-in?error=auth_callback&reason=provider%3Aaccess_denied&next=${encodeURIComponent(`/account?next=${encodeURIComponent(target)}`)}`,
    );
  });

  it("drops an unsafe nested continuation on callback failure", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const request = new NextRequest(
      `https://app.strelva.com/auth/callback?error=access_denied&next=${encodeURIComponent("/account?next=https://evil.example/private")}`,
    );

    const response = await GET(request);
    const location = response.headers.get("location") || "";

    expect(location).toBe("https://app.strelva.com/sign-in?error=auth_callback&reason=provider%3Aaccess_denied");
    expect(location).not.toContain("evil.example");
  });

  it("keeps the public account continuation recoverable after a provider failure", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const target = "/workspace/account?continue=public";
    const response = await GET(new NextRequest(
      `https://app.strelva.com/auth/callback?error=access_denied&next=${encodeURIComponent(target)}`,
    ));
    expect(response.headers.get("location")).toBe(
      `https://app.strelva.com/sign-in?error=auth_callback&reason=provider%3Aaccess_denied&next=${encodeURIComponent(target)}`,
    );
  });
});
