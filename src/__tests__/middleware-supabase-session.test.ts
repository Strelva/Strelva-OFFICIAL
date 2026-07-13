import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const captured = vi.hoisted(() => ({
  cookies: null as null | {
    setAll: (
      cookies: Array<{
        name: string;
        value: string;
        options: Record<string, unknown>;
      }>,
      headers: Record<string, string>
    ) => void;
  },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: { cookies: typeof captured.cookies }
  ) => {
    captured.cookies = options.cookies;
    return {};
  },
}));

import {
  applyMiddlewareSupabaseResponse,
  createMiddlewareSupabase,
} from "@/lib/db/middleware-client";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

beforeEach(() => {
  captured.cookies = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "publishable-test-key";
});

afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
});

describe("middleware Supabase session propagation", () => {
  it("copies refreshed cookies and cache headers to the selected proxy response", () => {
    const request = new NextRequest("https://app.strelva.com/dashboard");
    expect(createMiddlewareSupabase(request)).not.toBeNull();

    captured.cookies?.setAll(
      [
        {
          name: "sb-auth-token",
          value: "refreshed",
          options: { httpOnly: true, sameSite: "lax", path: "/" },
        },
      ],
      { "Cache-Control": "private, no-store", Expires: "0" }
    );

    const response = applyMiddlewareSupabaseResponse(request, NextResponse.next());

    expect(request.cookies.get("sb-auth-token")?.value).toBe("refreshed");
    expect(response.cookies.get("sb-auth-token")?.value).toBe("refreshed");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Expires")).toBe("0");
  });
});
