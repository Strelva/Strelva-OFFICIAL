import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ headers: vi.fn(), user: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.user, isSupabaseAuthConfigured: () => false }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); }, notFound: () => { throw new Error("not-found"); } }));
import proxy, { shouldRewriteMarketingRoot } from "@/proxy";
import { isPlatformPublicPath, marketingEntryTarget } from "@/app/(marketing)/platform-routing";
import HomePage from "@/app/(marketing)/home/page";
import AgenciesPage from "@/app/(marketing)/agencies/page";
import PricingPage from "@/app/(marketing)/pricing/page";
import MarketingLayout from "@/app/(marketing)/layout";
import TenantPublicLayout, { generateMetadata } from "@/app/(public)/layout";
import CatalogPage from "@/app/(public)/[...sitePath]/page";
import TryPage from "@/app/try/page";
const request = (host: string, path: string, headers: Record<string, string> = {}) => new NextRequest(`https://${host}${path}`, { headers: { host, ...headers } });

beforeEach(() => {
  vi.stubEnv("SCAFFOLD_DEV_UNGATED_ACCESS", "1");
  vi.stubEnv("STRELVA_UI_PREVIEW", "0");
  vi.stubEnv("STRELVA_MARKETING_ORIGIN", "");
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
  vi.stubEnv("STRELVA_AGENCY_SIGNUP_RELEASE", "0");
  vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", "0");
  mocks.headers.mockResolvedValue(new Headers({ host: "app.strelva.com" }));
  mocks.user.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("platform public routing", () => {
  it.each(["strelva.com", "www.strelva.com", "app.strelva.com", "localhost:3000", "candidate.vercel.app"])("routes %s root to the paper entry without tenant headers", async host => {
    const response = await proxy(request(host, "/", { "x-tenant": "demo", "x-preview-mode": "true" }));
    expect(response.headers.get("x-middleware-rewrite")).toBe(`https://${host}/home`);
    expect(response.headers.get("x-middleware-request-x-tenant")).toBeNull();
    expect(shouldRewriteMarketingRoot(host, "/")).toBe(true);
  });
  it.each(["/", "/home"])("keeps the app %s on the two doors even with a separate marketing origin", async path => {
    vi.stubEnv("STRELVA_MARKETING_ORIGIN", "https://marketing.example");
    const response = await proxy(request("app.strelva.com", `${path}?ref=agency&agency=studio`));
    expect(response.headers.get("location")).toBeNull();
    if (path === "/") expect(response.headers.get("x-middleware-rewrite")).toContain("/home?ref=agency&agency=studio");
  });
  it("retains optional marketing routing on the marketing host", async () => {
    vi.stubEnv("STRELVA_MARKETING_ORIGIN", "https://marketing.example");
    const response = await proxy(request("strelva.com", "/?ref=agency"));
    expect(response.headers.get("location")).toBe("https://marketing.example/?ref=agency");
  });
  it.each(["/demo", "/demo/"])("takes %s to the bounded public 1.0 demo and drops legacy routing inputs", async path => {
    const response = await proxy(request("app.strelva.com", `${path}?tenant=demo&view=settings`, { "x-tenant": "demo" }));
    expect(response.headers.get("location")).toBe("https://app.strelva.com/preview/strelva/demo");
  });
  it.each(["https://app.strelva.com", "https://strelva.com", "https://u:p@marketing.example", "https://marketing.example/path", "javascript:alert(1)", "invalid"])("falls back safely for a looping or invalid origin %s", target => {
    expect(marketingEntryTarget("strelva.com", "", target)).toBeNull();
  });
  it("does not rewrite a tenant root", async () => {
    expect(shouldRewriteMarketingRoot("fixture.strelva.com", "/")).toBe(false);
    const response = await proxy(request("fixture.strelva.com", "/"));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-tenant")).toBe("fixture");
  });
  it.each(["/agencies", "/pricing", "/try", "/try/shared-token"])("reserves %s against tenant query and header routing", async path => {
    const response = await proxy(request("app.strelva.com", `${path}?tenant=demo`, { "x-tenant": "demo" }));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-request-x-tenant")).toBeNull();
    expect(isPlatformPublicPath(path)).toBe(true);
  });
  it.each(["/agencies", "/pricing", "/try"])("sends tenant-host %s to the platform", async path => {
    const response = await proxy(request("fixture.strelva.com", path));
    expect(response.headers.get("location")).toBe(`https://app.strelva.com${path}`);
  });
  it("blocks tenant catch-all fallback and metadata on an unassigned platform host", async () => {
    await expect(TenantPublicLayout({ children: "Private fixture" })).rejects.toThrow("not-found");
    expect(await generateMetadata()).toEqual({ title: "Strelva", robots: { index: false, follow: false } });
    await expect(CatalogPage({ params: Promise.resolve({ sitePath: ["agencies", "unknown"] }) })).rejects.toThrow("not-found");
  });
  it("gives bare try a working destination", () => { expect(TryPage).toThrow("redirect:/audit"); });
});

describe("honest two-door entry", () => {
  it("keeps both jobs visible when signup is gated off, with a working free check", async () => {
    const html = renderToStaticMarkup(<HomePage />);
    expect(html).toContain("I run a business"); expect(html).toContain("I build for clients");
    expect(html).toContain("coming soon"); expect(html).toContain('href="/audit"');
    expect(html).not.toContain("Request your build");
    const agency = renderToStaticMarkup(await AgenciesPage());
    expect(agency).toContain("Agency signup is coming soon"); expect(agency).toContain("Add a client, then copy its owner claim link and share it yourself."); expect(agency).not.toContain("invite the business owner"); expect(agency).not.toContain('href="/sign-up?as=agency"');
  });
  it("opens each existing door only when its release gates permit it", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    expect(renderToStaticMarkup(<HomePage />)).not.toContain('href="/sign-up?as=business"');
    vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", "1");
    expect(renderToStaticMarkup(<HomePage />)).toContain('href="/sign-up?as=business"');
    expect(renderToStaticMarkup(await AgenciesPage())).not.toContain('href="/sign-up?as=agency"');
    vi.stubEnv("STRELVA_AGENCY_SIGNUP_RELEASE", "1");
    expect(renderToStaticMarkup(await AgenciesPage())).toContain('href="/sign-up?as=agency"');
  });
  it("shows account access for a real session and never invented pricing", async () => {
    mocks.user.mockResolvedValue({ id: "owner", email: "owner@example.invalid" });
    const html = renderToStaticMarkup(await MarketingLayout({ children: <PricingPage /> }));
    expect(html).toContain("Your workspace"); expect(html).not.toContain("Sign in");
    expect(html).toContain("Price shown before you pay"); expect(html).not.toMatch(/\[price\]|\$\d+/);
  });
});
