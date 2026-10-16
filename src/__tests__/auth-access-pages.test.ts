import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignUpPage from "@/app/sign-up/[[...sign-up]]/page";
import SignInPage from "@/app/sign-in/[[...sign-in]]/page";

const mockGetInvite = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockGetStoredContent = vi.hoisted(() => vi.fn());
const mockHeaderValues = vi.hoisted(() => new Map<string, string>());

vi.mock("@/components/auth/SupabaseSignIn", () => ({
  SupabaseSignIn: (props: Record<string, unknown>) =>
    React.createElement("div", null, props.heading as React.ReactNode, React.createElement("pre", { "data-supabase": "sign-in" }, JSON.stringify({ next: props.next, prefillEmail: props.prefillEmail, emailReady: props.emailReady }))),
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

vi.mock("@/lib/storage/content-store", () => ({ getStoredContent: mockGetStoredContent }));

describe("auth access pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    mockGetStoredContent.mockResolvedValue(null);
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

    const html = renderToStaticMarkup(await SignUpPage({
      searchParams: Promise.resolve({ email: "Owner@Example.com" }),
    }));

    expect(mockGetInvite).toHaveBeenCalledWith("owner@example.com");
    expect(html).toContain("Create access for Great Lakes Dried Fruit");
    expect(html).toContain('data-supabase="sign-in"');
    expect(html).toContain("&quot;next&quot;:&quot;/account&quot;");
    expect(html).toContain("&quot;prefillEmail&quot;:&quot;owner@example.com&quot;");
  });

  it.each(["0", "1"])("passes server email readiness %s to both entry methods", async ready => {
    vi.stubEnv("STRELVA_AUTH_EMAIL_READY", ready);
    for (const page of [SignUpPage, SignInPage]) {
      const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ email: "owner@example.com" }) }));
      expect(html).toContain(`&quot;emailReady&quot;:${ready === "1"}`);
    }
  });

  it("keeps public signup paused when there is no pending invite", async () => {
    mockGetInvite.mockResolvedValueOnce(null);
    mockHeaderValues.clear();

    const html = renderToStaticMarkup(await SignUpPage({
      searchParams: Promise.resolve({ email: "owner@example.com" }),
    }));

    expect(html).toContain("New accounts open soon");
    // The closed door points at the free check and neutral agency directory.
    expect(html).toContain('href="/audit"');
    expect(html).toMatch(/Want it done for you\? <a[^>]+href="\/agencies"[^>]*>Find an agency<\/a>/);
    expect(html).toContain('href="/agencies"');
    expect(html).not.toContain("Request your build");
    expect(html).not.toContain('data-clerk="sign-up"');
  });

  it("renders the invited Supabase sign-in for a pending invited email", async () => {

    const html = renderToStaticMarkup(await SignInPage({
      searchParams: Promise.resolve({ email: "owner@example.com" }),
    }));

    expect(html).toContain("Sign in to manage Great Lakes Dried Fruit");
    expect(html).toContain('data-supabase="sign-in"');
    expect(html).toContain("&quot;next&quot;:&quot;/account&quot;");
    expect(html).toContain("&quot;prefillEmail&quot;:&quot;owner@example.com&quot;");
  });

  it("renders the tenant Supabase sign-in without requiring an invite query", async () => {
    mockGetInvite.mockResolvedValueOnce(null);

    const html = renderToStaticMarkup(await SignInPage({
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain("Manage Great Lakes Dried Fruit");
    expect(html).toContain('data-supabase="sign-in"');
    expect(html).toContain("&quot;next&quot;:&quot;/client/gldf/dashboard&quot;");
  });

  it("uses a known business display font on trusted-host entry and preserves the return", async () => {
    mockGetInvite.mockResolvedValue(null);
    mockGetStoredContent.mockResolvedValue({ fontDisplay: "Georgia, serif" });
    for (const page of [SignInPage, SignUpPage]) {
      const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({}) }));
      // XA sign-in: no agency resolved, so the door names the business in its own font, never the fallback string.
      if (page === SignInPage) {
        expect(html).toMatch(/<a[^>]+style="font-family:Georgia, serif"[^>]*>(?:(?!<\/a>).)*Great Lakes Dried Fruit/);
        expect(html).not.toContain("Agency identity unavailable");
      } else expect(html).toMatch(/<a[^>]+style="font-family:Georgia, serif"[^>]*>(?:(?!<\/a>).)*Agency identity unavailable/);
      expect(html).toContain("&quot;next&quot;:&quot;/client/gldf/dashboard&quot;");
    }
    expect(mockGetStoredContent).toHaveBeenCalledWith("theme", "gldf");
  });

  it.each([null, new Error("Theme read unavailable")])("keeps sign-in working when the business theme is absent or unavailable (%s)", async theme => {
    mockGetInvite.mockResolvedValue(null);
    if (theme instanceof Error) mockGetStoredContent.mockRejectedValue(theme);
    else mockGetStoredContent.mockResolvedValue(theme);
    const html = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Manage Great Lakes Dried Fruit");
    expect(html).not.toContain("font-family:");
    expect(html).toContain("&quot;next&quot;:&quot;/client/gldf/dashboard&quot;");
  });

  it("renders the tenant Supabase signup without requiring an invite query", async () => {
    mockGetInvite.mockResolvedValueOnce(null);

    const html = renderToStaticMarkup(await SignUpPage({
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain("Manage Great Lakes Dried Fruit");
    expect(html).toContain('data-supabase="sign-in"');
    expect(html).toContain("&quot;next&quot;:&quot;/client/gldf/dashboard&quot;");
  });

  it("uses work language and workspace return for the general auth path when open", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", "1");
    mockHeaderValues.clear();
    mockGetInvite.mockResolvedValue(null);

    const signIn = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({}) }));
    const signUp = renderToStaticMarkup(await SignUpPage({ searchParams: Promise.resolve({}) }));

    expect(signIn).toContain("Sign in");
    expect(signIn).toContain("&quot;next&quot;:&quot;/workspace&quot;");
    expect(signIn).not.toContain("AI Visibility");
    expect(signUp).toContain("Make your Strelva account.");
    expect(signUp).toContain("&quot;next&quot;:&quot;/workspace/business/new&quot;");
    // One way to sign in, top right, carrying where sign-up was headed.
    expect(signUp.match(/href="\/sign-in\?next=%2Fworkspace%2Fbusiness%2Fnew"[^>]*>Sign in<\/a>/g)).toHaveLength(1);
  });

  it("asks business or agency when the agency front door is on, and sends agencies to setup", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", "1");
    vi.stubEnv("STRELVA_AGENCY_SIGNUP_RELEASE", "1");
    mockHeaderValues.clear();
    mockGetInvite.mockResolvedValue(null);

    const business = renderToStaticMarkup(await SignUpPage({ searchParams: Promise.resolve({ next: "/workspace?save=scan_public123" }) }));
    expect(business).toContain("Who is this for?");
    expect(business).toContain("Use it yourself");
    expect(business).toContain('href="/sign-up?as=agency"');
    expect(business).toContain('aria-current="page"');
    expect(business).toContain("Make your Strelva account.");
    expect(business).toContain("&quot;next&quot;:&quot;/workspace?save=scan_public123&quot;");
    // Strelva is not the default provider on the neutral front door (ADR 0012).
    expect(business).not.toContain("Request your build");

    const agency = renderToStaticMarkup(await SignUpPage({ searchParams: Promise.resolve({ as: "agency", next: "/workspace?save=scan_public123" }) }));
    expect(agency).toContain("Make your Strelva account.");
    expect(agency).toContain("They own it; you work inside it.");
    expect(agency).toContain("&quot;next&quot;:&quot;/workspace/agency/start&quot;");
    expect(agency).toContain('href="/sign-up?next=%2Fworkspace%3Fsave%3Dscan_public123"');
  });

  it("keeps the agency choice off by default", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", "1");
    mockHeaderValues.clear();
    mockGetInvite.mockResolvedValue(null);

    const html = renderToStaticMarkup(await SignUpPage({ searchParams: Promise.resolve({ as: "agency" }) }));
    expect(html).not.toContain("Who is this for?");
    expect(html).toContain("Make your Strelva account.");
    expect(html).toContain("&quot;next&quot;:&quot;/workspace/business/new&quot;");
  });

  it("preserves a supported public-result destination through general signup", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", "1");
    mockHeaderValues.clear();
    mockGetInvite.mockResolvedValue(null);
    const target = "/workspace?save=scan_public123";

    const html = renderToStaticMarkup(await SignUpPage({
      searchParams: Promise.resolve({ next: target }),
    }));

    expect(html).toContain(`&quot;next&quot;:&quot;${target}&quot;`);
  });

  it("preserves the private public-brief continuation through general sign-up and sign-in", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", "1");
    mockHeaderValues.clear();
    mockGetInvite.mockResolvedValue(null);
    const target = "/workspace/account?continue=public";

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

    const html = renderToStaticMarkup(await SignInPage({
      searchParams: Promise.resolve({ email: "owner@example.com", error: "auth_callback", next: wrapped }),
    }));

    expect(html).toContain(`&quot;next&quot;:&quot;${wrapped}&quot;`);
    expect(html).toContain("Sign in to manage Great Lakes Dried Fruit");
  });

  it("falls back to the workspace root for an unsafe signup destination", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", "1");
    mockHeaderValues.clear();
    mockGetInvite.mockResolvedValue(null);

    const html = renderToStaticMarkup(await SignUpPage({
      searchParams: Promise.resolve({ next: "https://evil.example/private" }),
    }));

    expect(html).toContain("&quot;next&quot;:&quot;/workspace/business/new&quot;");
    expect(html).not.toContain("evil.example");
  });

  it("keeps direct business sign-up closed when only the workspace is open", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    mockHeaderValues.clear();
    mockGetInvite.mockResolvedValue(null);

    for (const next of [undefined, "/workspace?save=scan_public123", "/workspace/account?continue=public"]) {
      const html = renderToStaticMarkup(await SignUpPage({ searchParams: Promise.resolve(next ? { next } : {}) }));
      expect(html).toContain("New accounts open soon");
      expect(html).toMatch(/Want it done for you\? <a[^>]+href="\/agencies"[^>]*>Find an agency<\/a>/);
      expect(html).not.toContain('data-supabase="sign-in"');
      expect(html).not.toContain("/workspace/business/new");
      // No agency door either: nothing points at agency sign-up.
      expect(html).not.toContain("as=agency");
    }
  });

  it("keeps the agency door and claim links open while business sign-up is closed", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_AGENCY_SIGNUP_RELEASE", "1");
    mockHeaderValues.clear();
    mockGetInvite.mockResolvedValue(null);

    const closed = renderToStaticMarkup(await SignUpPage({ searchParams: Promise.resolve({}) }));
    expect(closed).toContain("New accounts open soon");
    expect(closed).toContain('href="/sign-up?as=agency"');
    expect(closed).not.toContain("Who is this for?");

    const agency = renderToStaticMarkup(await SignUpPage({ searchParams: Promise.resolve({ as: "agency" }) }));
    expect(agency).toContain("Make your Strelva account.");
    expect(agency).toContain("&quot;next&quot;:&quot;/workspace/agency/start&quot;");
    expect(agency).not.toContain("Use it yourself");

    const claim = `/workspace/claim/${"a".repeat(43)}`;
    const claimed = renderToStaticMarkup(await SignUpPage({ searchParams: Promise.resolve({ next: claim }) }));
    expect(claimed).toContain(`&quot;next&quot;:&quot;${claim}&quot;`);
    expect(claimed).not.toContain("New accounts open soon");
  });
});
