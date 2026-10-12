import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ actor: vi.fn(), finish: vi.fn(), importFacts: vi.fn(), discover: vi.fn() }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/workspaces/http", async (original) => ({ ...(await original<object>()), workspaceHttpActor: f.actor }));
vi.mock("@/products/google-listing/server", () => ({ finishNativeGoogleOAuth: f.finish, NATIVE_GOOGLE_OAUTH_COOKIE: "strelva_native_google_oauth" }));
vi.mock("@/products/google-listing/connect", async (original) => ({ ...(await original<object>()), importGoogleFoundFacts: f.importFacts, finishGoogleDiscovery: f.discover, admitOwnerConnect: vi.fn() }));
import { GET as nativeCallback } from "@/app/api/workspace/publishing/google/oauth/callback/route";
import { GET as discoverCallback } from "@/app/api/workspace/publishing/google/discover/callback/route";

const WS = "11111111-1111-4111-8111-111111111111";
const state = `${Buffer.from(JSON.stringify({ workspaceId: WS })).toString("base64url")}.sig`;
const request = (path: string, accept = "text/html") => new NextRequest(`https://app.example.test${path}?state=${state}&code=c`, { headers: { accept, cookie: "strelva_native_google_oauth=n; strelva_google_discover=n" } });
beforeEach(() => { for (const mock of Object.values(f)) mock.mockReset(); f.actor.mockResolvedValue({ userId: "u", verifiedEmail: "o@example.test" }); vi.stubEnv("STRELVA_GOOGLE_OWNER_CONNECT", "1"); });
afterEach(() => vi.unstubAllEnvs());

describe("returning from Google", () => {
  it("sends a person back to the Google place and reads found facts once, keeping JSON for scripted proofs", async () => {
    f.finish.mockResolvedValue({ workspaceId: WS, bindingId: WS, status: "connected" });
    f.importFacts.mockResolvedValue({ status: "access_pending", count: 0 });
    const page = await nativeCallback(request("/api/workspace/publishing/google/oauth/callback"));
    expect(page.status).toBe(303);
    expect(page.headers.get("location")).toBe(`https://app.example.test/workspace/google?workspaceId=${WS}&connect=connected&read=access_pending`);
    expect(f.importFacts).toHaveBeenCalledTimes(1);
    const scripted = await nativeCallback(request("/api/workspace/publishing/google/oauth/callback", "application/json"));
    expect(scripted.headers.get("content-type")).toContain("application/json"); expect(f.importFacts).toHaveBeenCalledTimes(1);
  });
  it("keeps the grant when the found-fact read throws, and reports failures without leaking detail", async () => {
    f.finish.mockResolvedValue({ workspaceId: WS, status: "connected" }); f.importFacts.mockRejectedValue(new Error("403"));
    expect((await nativeCallback(request("/api/workspace/publishing/google/oauth/callback"))).headers.get("location")).toContain("connect=connected&read=unavailable");
    f.finish.mockRejectedValue(new Error("Google did not authorize the exact selected account/place."));
    expect((await nativeCallback(request("/api/workspace/publishing/google/oauth/callback"))).headers.get("location")).toBe(`https://app.example.test/workspace/google?workspaceId=${WS}&connect=failed`);
  });
  it("with the flag off, the native callback answers JSON exactly as before", async () => {
    vi.stubEnv("STRELVA_GOOGLE_OWNER_CONNECT", "0");
    f.finish.mockResolvedValue({ workspaceId: WS, status: "connected" });
    const response = await nativeCallback(request("/api/workspace/publishing/google/oauth/callback"));
    expect(response.status).toBe(200); expect(f.importFacts).not.toHaveBeenCalled();
  });
  it("step one sets the signed listing choice only for the listing page, or explains quota 0", async () => {
    f.discover.mockResolvedValue({ status: "chosen", choices: { workspaceId: WS }, cookie: "signed-choices" });
    const chosen = await discoverCallback(request("/api/workspace/publishing/google/discover/callback"));
    expect(chosen.headers.get("location")).toBe(`https://app.example.test/workspace/google?workspaceId=${WS}&connect=choose`);
    expect(chosen.headers.get("set-cookie")).toContain("strelva_google_discover_choices=signed-choices"); expect(chosen.headers.get("set-cookie")).toContain("Path=/workspace/google");
    f.discover.mockResolvedValue({ status: "access_pending", workspaceId: WS });
    expect((await discoverCallback(request("/api/workspace/publishing/google/discover/callback"))).headers.get("location")).toContain("connect=access_pending");
  });
});

import { safeReturnTo, withGoogleOutcome } from "@/products/google-listing/connect/return-to";
describe("returnTo after Connect Google", () => {
  it("honors only a same-origin relative path", () => {
    expect(safeReturnTo("/workspace/claim/t?x=1")).toBe("/workspace/claim/t?x=1");
    for (const bad of ["https://evil.test/x", "//evil.test/x", "/\\evil.test", "/api/workspace/x", "workspace/claim", "javascript:alert(1)", "/a\nb", "", null, `/${"a".repeat(600)}`]) expect(safeReturnTo(bad)).toBeNull();
    expect(withGoogleOutcome("/workspace/claim/t?x=1", { google: "connected" })).toBe("/workspace/claim/t?x=1&google=connected");
  });
  it("sends the owner back to the claim review after the grant, and ignores a forged cookie", async () => {
    f.finish.mockResolvedValue({ workspaceId: WS, status: "connected" }); f.importFacts.mockResolvedValue({ status: "found", count: 3 });
    const withCookie = (value: string) => new NextRequest(`https://app.example.test/api/workspace/publishing/google/oauth/callback?state=${state}&code=c`, { headers: { accept: "text/html", cookie: `strelva_native_google_oauth=n; strelva_google_return=${encodeURIComponent(value)}` } });
    expect((await nativeCallback(withCookie("/workspace/claim/t"))).headers.get("location")).toBe("https://app.example.test/workspace/claim/t?google=connected&read=found");
    expect((await nativeCallback(withCookie("https://evil.test/"))).headers.get("location")).toBe(`https://app.example.test/workspace/google?workspaceId=${WS}&connect=connected&read=found`);
  });
});
