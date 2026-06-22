import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetInvite = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockHeaderValues = vi.hoisted(() => new Map<string, string>());

vi.mock("@/components/auth/SupabaseSignIn", () => ({
  SupabaseSignIn: (props: Record<string, unknown>) =>
    React.createElement("pre", { "data-supabase": "sign-in" }, JSON.stringify(props)),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: (name: string) => mockHeaderValues.get(name) || null,
    }),
  ),
}));

vi.mock("@/lib/invites", () => ({
  getInvite: mockGetInvite,
}));

vi.mock("@/lib/tenants", () => ({
  getTenantConfig: mockGetTenantConfig,
}));

describe("auth access pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaderValues.clear();
    mockHeaderValues.set("x-client-fallback-root", "/client/gldf");
    mockHeaderValues.set("x-tenant", "gldf");
    mockGetInvite.mockResolvedValue({
      tenant: "gldf",
      role: "owner",
      invitedAt: "2026-05-16T00:00:00.000Z",
    });
    mockGetTenantConfig.mockResolvedValue({
      id: "gldf",
      siteName: "Great Lakes Dried Fruit",
      active: true,
    });
  });

  it("renders the invited Supabase signup for a pending invited email", async () => {
    const { default: SignUpPage } = await import("@/app/sign-up/[[...sign-up]]/page");

    const html = renderToStaticMarkup(await SignUpPage({
      searchParams: Promise.resolve({ email: "Owner@Example.com" }),
    }));

    expect(mockGetInvite).toHaveBeenCalledWith("owner@example.com");
    expect(html).toContain("Create access for Great Lakes Dried Fruit.");
    expect(html).toContain('data-supabase="sign-in"');
    expect(html).toContain("&quot;next&quot;:&quot;/account&quot;");
    expect(html).toContain("&quot;prefillEmail&quot;:&quot;owner@example.com&quot;");
  });

  it("keeps public signup paused when there is no pending invite", async () => {
    mockGetInvite.mockResolvedValueOnce(null);
    mockHeaderValues.clear();
    const { default: SignUpPage } = await import("@/app/sign-up/[[...sign-up]]/page");

    const html = renderToStaticMarkup(await SignUpPage({
      searchParams: Promise.resolve({ email: "owner@example.com" }),
    }));

    expect(html).toContain("Dashboard access is invite-only.");
    expect(html).toContain("Request your build");
    expect(html).not.toContain('data-clerk="sign-up"');
  });

  it("renders the invited Supabase sign-in for a pending invited email", async () => {
    const { default: SignInPage } = await import("@/app/sign-in/[[...sign-in]]/page");

    const html = renderToStaticMarkup(await SignInPage({
      searchParams: Promise.resolve({ email: "owner@example.com" }),
    }));

    expect(html).toContain("Sign in to manage Great Lakes Dried Fruit.");
    expect(html).toContain('data-supabase="sign-in"');
    expect(html).toContain("&quot;next&quot;:&quot;/account&quot;");
    expect(html).toContain("&quot;prefillEmail&quot;:&quot;owner@example.com&quot;");
  });

  it("renders the tenant Supabase sign-in without requiring an invite query", async () => {
    mockGetInvite.mockResolvedValueOnce(null);
    const { default: SignInPage } = await import("@/app/sign-in/[[...sign-in]]/page");

    const html = renderToStaticMarkup(await SignInPage({
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain("Sign in to manage Great Lakes Dried Fruit.");
    expect(html).toContain('data-supabase="sign-in"');
    expect(html).toContain("&quot;next&quot;:&quot;/client/gldf/dashboard&quot;");
  });

  it("renders the tenant Supabase signup without requiring an invite query", async () => {
    mockGetInvite.mockResolvedValueOnce(null);
    const { default: SignUpPage } = await import("@/app/sign-up/[[...sign-up]]/page");

    const html = renderToStaticMarkup(await SignUpPage({
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain("Create access for Great Lakes Dried Fruit.");
    expect(html).toContain('data-supabase="sign-in"');
    expect(html).toContain("&quot;next&quot;:&quot;/client/gldf/dashboard&quot;");
  });
});
