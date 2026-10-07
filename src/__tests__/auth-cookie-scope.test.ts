import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fixture = vi.hoisted(() => ({
  set: vi.fn(),
  adapters: [] as Array<{ cookies: { setAll: (values: Array<{ name: string; value: string; options: { domain?: string; path: string; secure: boolean } }>) => void } }>,
  browserOptions: null as null | { cookieOptions?: { domain?: string } },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: fixture.set }) }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: typeof fixture.adapters[number]) => {
    fixture.adapters.push(options);
    return { auth: { exchangeCodeForSession: async () => {
      options.cookies.setAll([{ name: "sb-session", value: "callback", options: { domain: ".sites.example", path: "/", secure: true } }]);
      return { error: null };
    } } };
  },
  createBrowserClient: (_url: string, _key: string, options: typeof fixture.browserOptions) => {
    fixture.browserOptions = options;
    return {};
  },
}));
beforeEach(() => {
  fixture.adapters.length = 0;
  fixture.set.mockReset();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "fixture-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("auth cookies stay host-only across all session writers", () => {
  it("strips a sites-apex Domain in the server adapter without changing other attributes", async () => {
    const { createUserClient } = await import("@/platform/infra/db/server-client");
    await createUserClient();
    fixture.adapters[0]!.cookies.setAll([{ name: "sb-session", value: "server", options: { domain: ".sites.example", path: "/", secure: true } }]);
    expect(fixture.set).toHaveBeenCalledWith("sb-session", "server", { path: "/", secure: true });
  });
  it("exchanges the callback code into a host-only app session", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new NextRequest("https://app.strelva.com/auth/callback?code=fixture&next=/workspace"));
    expect(response.headers.get("location")).toBe("https://app.strelva.com/workspace");
    expect(response.cookies.get("sb-session")?.value).toBe("callback");
    expect(response.headers.get("set-cookie")).not.toContain("Domain=");
  });
  it("keeps browser session creation host-only", async () => {
    const { createBrowserSupabase } = await import("@/platform/infra/db/browser-client");
    expect(createBrowserSupabase()).not.toBeNull();
    expect(fixture.browserOptions?.cookieOptions).toEqual({ domain: undefined });
  });
});
