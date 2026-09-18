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
    vi.unstubAllEnvs();
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
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

  it("uses work language and workspace return for the general auth path when open", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    mockHeaderValues.clear();
    mockGetInvite.mockResolvedValue(null);
    const { default: SignInPage } = await import("@/app/sign-in/[[...sign-in]]/page");
    const { default: SignUpPage } = await import("@/app/sign-up/[[...sign-up]]/page");

    const signIn = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({}) }));
    const signUp = renderToStaticMarkup(await SignUpPage({ searchParams: Promise.resolve({}) }));

    expect(signIn).toContain("Sign in to your work.");
    expect(signIn).toContain("&quot;next&quot;:&quot;/workspace&quot;");
    expect(signIn).toContain("Try the free AI Visibility audit");
    expect(signUp).toContain("Start your work here.");
    expect(signUp).toContain("&quot;next&quot;:&quot;/workspace&quot;");
    expect(signUp).toContain("Need a managed website? Request your build");
  });

  it("preserves a supported public-result destination through general signup", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    mockHeaderValues.clear();
    mockGetInvite.mockResolvedValue(null);
    const target = "/workspace?save=scan_public123";
    const { default: SignUpPage } = await import("@/app/sign-up/[[...sign-up]]/page");

    const html = renderToStaticMarkup(await SignUpPage({
      searchParams: Promise.resolve({ next: target }),
    }));

    expect(html).toContain(`&quot;next&quot;:&quot;${target}&quot;`);
  });

  it("preserves the private public-brief continuation through general sign-up and sign-in", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    mockHeaderValues.clear();
    mockGetInvite.mockResolvedValue(null);
    const target = "/workspace/account?continue=public";
    const { default: SignInPage } = await import("@/app/sign-in/[[...sign-in]]/page");
    const { default: SignUpPage } = await import("@/app/sign-up/[[...sign-up]]/page");

    const signIn = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({ next: target }) }));
    const signUp = renderToStaticMarkup(await SignUpPage({ searchParams: Promise.resolve({ next: target }) }));

    expect(signIn).toContain(`&quot;next&quot;:&quot;${target}&quot;`);
    expect(signUp).toContain(`&quot;next&quot;:&quot;${target}&quot;`);
    expect(signIn).not.toContain("Public context only");
    expect(signUp).not.toContain("Public context only");
  });

  it("keeps invitation claiming ahead of a supported public-result destination", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    mockHeaderValues.clear();
    mockGetInvite.mockReset();
    mockGetInvite.mockResolvedValue({
      tenant: "gldf",
      role: "owner",
      invitedAt: "2026-05-16T00:00:00.000Z",
    });
    mockGetTenantConfig.mockReset();
    mockGetTenantConfig.mockResolvedValue({
      id: "gldf",
      siteName: "Great Lakes Dried Fruit",
      active: true,
    });
    const target = "/workspace?save=scan_public123";
    const { default: SignUpPage } = await import("@/app/sign-up/[[...sign-up]]/page");

    const html = renderToStaticMarkup(await SignUpPage({
      searchParams: Promise.resolve({ email: "owner@example.com", next: target }),
    }));

    expect(html).toContain(`&quot;next&quot;:&quot;/account?next=${encodeURIComponent(target)}&quot;`);
    expect(html).not.toContain("scan_public123&next=");
  });

  it("preserves the same invitation continuation on sign-in", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    mockHeaderValues.clear();
    mockGetInvite.mockReset();
    mockGetInvite.mockResolvedValue({
      tenant: "gldf",
      role: "owner",
      invitedAt: "2026-05-16T00:00:00.000Z",
    });
    mockGetTenantConfig.mockReset();
    mockGetTenantConfig.mockResolvedValue({
      id: "gldf",
      siteName: "Great Lakes Dried Fruit",
      active: true,
    });
    const target = "/workspace?save=scan_public123";
    const { default: SignInPage } = await import("@/app/sign-in/[[...sign-in]]/page");

    const html = renderToStaticMarkup(await SignInPage({
      searchParams: Promise.resolve({ email: "owner@example.com", next: target }),
    }));

    expect(html).toContain(`&quot;next&quot;:&quot;/account?next=${encodeURIComponent(target)}&quot;`);
  });

  it("keeps an invitation continuation available after callback failure", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    mockHeaderValues.clear();
    mockGetInvite.mockReset();
    mockGetInvite.mockResolvedValue(null);
    const target = "/workspace?save=scan_public123";
    const wrapped = `/account?next=${encodeURIComponent(target)}`;
    const { default: SignInPage } = await import("@/app/sign-in/[[...sign-in]]/page");

    const html = renderToStaticMarkup(await SignInPage({
      searchParams: Promise.resolve({ error: "auth_callback", next: wrapped }),
    }));

    expect(html).toContain(`&quot;next&quot;:&quot;${wrapped}&quot;`);
  });

  it("keeps the nested continuation in the invited branch after callback failure", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    mockHeaderValues.clear();
    mockGetInvite.mockReset();
    mockGetInvite.mockResolvedValue({
      tenant: "gldf",
      role: "owner",
      invitedAt: "2026-05-16T00:00:00.000Z",
    });
    mockGetTenantConfig.mockReset();
    mockGetTenantConfig.mockResolvedValue({
      id: "gldf",
      siteName: "Great Lakes Dried Fruit",
      active: true,
    });
    const target = "/workspace?save=scan_public123";
    const wrapped = `/account?next=${encodeURIComponent(target)}`;
    const { default: SignInPage } = await import("@/app/sign-in/[[...sign-in]]/page");

    const html = renderToStaticMarkup(await SignInPage({
      searchParams: Promise.resolve({ email: "owner@example.com", error: "auth_callback", next: wrapped }),
    }));

    expect(html).toContain(`&quot;next&quot;:&quot;${wrapped}&quot;`);
    expect(html).toContain("Sign in to manage Great Lakes Dried Fruit.");
  });

  it("falls back to the workspace root for an unsafe signup destination", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    mockHeaderValues.clear();
    mockGetInvite.mockResolvedValue(null);
    const { default: SignUpPage } = await import("@/app/sign-up/[[...sign-up]]/page");

    const html = renderToStaticMarkup(await SignUpPage({
      searchParams: Promise.resolve({ next: "https://evil.example/private" }),
    }));

    expect(html).toContain("&quot;next&quot;:&quot;/workspace&quot;");
    expect(html).not.toContain("evil.example");
  });
});
