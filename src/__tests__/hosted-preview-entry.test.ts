import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/server-client", () => ({ isSupabaseAuthConfigured: () => false }));
vi.mock("@/lib/db/middleware-client", () => ({
  createMiddlewareSupabase: () => null,
  applyMiddlewareSupabaseResponse: (_request: unknown, response: unknown) => response,
}));
import proxy from "@/proxy";

afterEach(() => vi.unstubAllEnvs());
const request = (path: string) => new NextRequest(`https://strelva-app-staging-strelva.vercel.app${path}`);

describe("hosted fixture entry", () => {
  it("opens the fixture without granting access to real dashboard or API routes", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("STRELVA_UI_PREVIEW", "1");
    for (const path of ["/", "/sign-in", "/sign-up", "/workspace"]) {
      const response = await proxy(request(path));
      expect(new URL(response.headers.get("location")!).pathname).toBe("/preview/strelva/workspace");
    }
    for (const path of ["/dashboard", "/api/billing/subscribe"]) {
      const response = await proxy(request(path));
      expect(new URL(response.headers.get("location")!).pathname).toBe("/sign-in");
    }
  });

  it.each(["production", "development", ""])("does not redirect sign-in on Vercel target %s", async target => {
    vi.stubEnv("VERCEL_ENV", target);
    vi.stubEnv("STRELVA_UI_PREVIEW", "1");
    expect((await proxy(request("/sign-in"))).headers.get("location")).toBeNull();
  });

  it("requires explicit preview opt-in", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("STRELVA_UI_PREVIEW", "0");
    expect((await proxy(request("/sign-in"))).headers.get("location")).toBeNull();
  });
});
