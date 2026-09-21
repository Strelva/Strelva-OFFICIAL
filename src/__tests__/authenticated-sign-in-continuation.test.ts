import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const user = vi.hoisted(() => vi.fn());
const invite = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn((target: string): never => { throw new Error(`REDIRECT:${target}`); }));
vi.mock("@/lib/db/server-client", () => ({ getSessionUser: user }));
vi.mock("@/lib/invites", () => ({ getInvite: invite }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: vi.fn(async () => ({ id: "example", siteName: "Example", active: true })) }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/auth/SupabaseSignIn", () => ({ SupabaseSignIn: (props: Record<string, unknown>) => createElement("pre", null, JSON.stringify(props)) }));
vi.mock("@/components/AuthDocumentTitle", () => ({ AuthDocumentTitle: () => null }));
vi.mock("@/components/Logo", () => ({ LogoFull: () => null }));
import SignInPage from "@/app/sign-in/[[...sign-in]]/page";

const confirmed = { id: "b9100000-0000-4000-8000-000000000001", email: "owner@example.test", email_confirmed_at: "2026-09-21T12:00:00Z" };
const start = "/workspace/business/new?start=website";
function page(params: Record<string, string | string[] | undefined>) {
  return SignInPage({ searchParams: Promise.resolve(params) });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  user.mockResolvedValue(confirmed);
  invite.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("authenticated public start continuation", () => {
  it.each([start, "/workspace/business/new?start=applications", "/workspace/business/new?start=onboarding", "/workspace/account?continue=public", `/account?next=${encodeURIComponent(start)}`, `/workspace/invitations/accept/${"a".repeat(43)}`])("continues a verified session to bounded target %s", async next => {
    await expect(page({ next })).rejects.toThrow(`REDIRECT:${next}`);
    expect(user).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith(next);
  });

  it("keeps a signed-out visitor at sign-in with the original destination", async () => {
    user.mockResolvedValue(null);
    const html = renderToStaticMarkup(await page({ next: start }));
    expect(html).toContain("Your work starts here.");
    expect(html).toContain(start);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not treat an unconfirmed email as a verified workspace identity", async () => {
    user.mockResolvedValue({ ...confirmed, email_confirmed_at: null });
    await page({ next: start });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("keeps sign-in available if the Auth verification service fails", async () => {
    user.mockRejectedValue(new Error("Synthetic Auth outage"));
    expect(renderToStaticMarkup(await page({ next: start }))).toContain("Your work starts here.");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not activate workspace entry when its release is closed", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    await page({ next: start });
    expect(user).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("preserves callback failures so another session cannot silently hide failed sign-in", async () => {
    const html = renderToStaticMarkup(await page({ next: start, error: "auth_callback" }));
    expect(html).toContain("Sign-in did not complete.");
    expect(user).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("preserves explicit email selection even without a pending invite", async () => {
    await page({ next: start, email: "another@example.test" });
    expect(user).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not skip the existing invite-claim boundary for a signed-in person", async () => {
    invite.mockResolvedValue({ tenant: "example", role: "owner" });
    const html = renderToStaticMarkup(await page({ next: start, email: "invited@example.test" }));
    expect(html).toContain("Sign in to manage Example.");
    expect(html).toContain(`/account?next=${encodeURIComponent(start)}`);
    expect(user).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each(["https://example.test", "//example.test", "/sign-in", "/workspace/business/new?start=website&request=private", "/workspace?unknown=1"])("does not resume to unbounded target %s", async next => {
    await page({ next });
    expect(user).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not choose between duplicate next parameters for an automatic redirect", async () => {
    await page({ next: [start, "/workspace"] });
    expect(user).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
