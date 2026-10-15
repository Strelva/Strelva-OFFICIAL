import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), permission: vi.fn(), state: vi.fn(), begin: vi.fn(), current: vi.fn(), complete: vi.fn(), save: vi.fn(), fetch: vi.fn(), active: vi.fn(), tenant: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ verifyAuth: mocks.authenticated, requireTenantPermission: mocks.permission }));
vi.mock("@/lib/oauth-state", () => ({ consumeOAuthState: mocks.state, createOAuthState: () => "signed-state" }));
vi.mock("@/app/api/oauth/calendly/connection-holder", () => ({ beginOAuthHolder: mocks.begin, assertCurrentOAuthHolder: mocks.current, completeOAuthHolder: mocks.complete }));
vi.mock("@/lib/connections", () => ({ saveConnection: mocks.save }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null }));
vi.mock("@/lib/client-records", () => ({ mirrorRecord: vi.fn() }));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: mocks.active }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: mocks.tenant }));
import { GET as calendlyCallback } from "@/app/api/oauth/calendly/callback/route";
import { GET as instagramCallback } from "@/app/api/oauth/instagram/callback/route";
import { GET as calendlyStart } from "@/app/api/oauth/calendly/route";
import { GET as instagramStart } from "@/app/api/oauth/instagram/route";
const operation = { provider: "fictional", commandId: "fictional-operation" };
const destinations = (response: Response) => new URL(response.headers.get("location")!);
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fictional.test");
  for (const provider of ["CALENDLY", "INSTAGRAM"]) { vi.stubEnv(`${provider}_CLIENT_ID`, "fixture-id"); vi.stubEnv(`${provider}_CLIENT_SECRET`, "fixture-secret"); }
  mocks.authenticated.mockResolvedValue(true); mocks.permission.mockResolvedValue(null); mocks.state.mockResolvedValue({ tenantId: "harbor-dental" });
  mocks.begin.mockResolvedValue(operation); mocks.complete.mockResolvedValue(undefined); mocks.active.mockResolvedValue(null); mocks.tenant.mockResolvedValue("harbor-dental");
  vi.stubGlobal("fetch", mocks.fetch); vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.fetch.mockImplementation(async (url: string) => {
    if (url.includes("users/me")) return Response.json({ resource: { uri: "https://api.calendly.com/users/fictional", current_organization: "https://api.calendly.com/organizations/fictional" } });
    if (url.includes("webhook_subscriptions")) return Response.json({});
    return Response.json({ access_token: "secret-canary", expires_in: 3600 });
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

for (const [provider, callback, start] of [["calendly", calendlyCallback, calendlyStart], ["instagram", instagramCallback, instagramStart]] as const) {
  describe(`${provider} OAuth holder boundary`, () => {
    const call = () => callback(new Request(`https://fictional.test/api/oauth/${provider}/callback?code=fixture-code&state=signed-state`));
    it("records ownership after token persistence and before reporting success", async () => {
      const response = await call();
      expect(destinations(response).searchParams.has("success")).toBe(true);
      expect(mocks.begin).toHaveBeenCalledExactlyOnceWith(provider, "harbor-dental");
      expect(mocks.begin.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0]!);
      expect(mocks.current.mock.invocationCallOrder[0]).toBeLessThan(mocks.save.mock.invocationCallOrder[0]!);
      expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.complete.mock.invocationCallOrder[0]!);
      expect(mocks.complete).toHaveBeenCalledExactlyOnceWith(operation);
      expect(response.headers.get("location")).not.toContain("secret-canary");
    });
    it("checks eligibility at initiation before constructing the provider redirect", async () => {
      expect((await start()).status).toBe(307);
      expect(mocks.begin).toHaveBeenCalledExactlyOnceWith(provider, "harbor-dental");
    });
    it("refuses unavailable initiation eligibility", async () => {
      mocks.begin.mockRejectedValue(new Error("Not eligible"));
      expect((await start()).status).toBe(403); expect(mocks.fetch).not.toHaveBeenCalled();
    });
    it("refuses unavailable callback eligibility before provider exchange", async () => {
      mocks.begin.mockRejectedValue(new Error("Not eligible"));
      expect(destinations(await call()).searchParams.has("success")).toBe(false);
      expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
    });
    it("keeps permission denial ahead of holder resolution and provider exchange", async () => {
      mocks.permission.mockResolvedValue(Response.json({ error: "Forbidden" }, { status: 403 }));
      await call(); expect(mocks.begin).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
    });
    it("does not persist tokens when current workspace authority changed during exchange", async () => {
      mocks.current.mockRejectedValue(new Error("Link changed"));
      expect(destinations(await call()).searchParams.has("success")).toBe(false);
      expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
    });
    it("does not claim success when holder recording fails", async () => {
      mocks.complete.mockRejectedValue(new Error("secret-canary"));
      const result = destinations(await call());
      expect(result.searchParams.has("success")).toBe(false);
      expect(result.searchParams.get("error")).toContain("connected, but setup is incomplete");
      expect(mocks.save).toHaveBeenCalledOnce(); expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret-canary");
    });
    it("does not log provider token rejection bodies", async () => {
      mocks.fetch.mockResolvedValueOnce(new Response("secret-canary", { status: 403 }));
      await call(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret-canary");
    });
    it("preserves a legacy-only callback when the gated holder operation is absent", async () => {
      mocks.begin.mockResolvedValue(null);
      expect(destinations(await call()).searchParams.has("success")).toBe(true);
      expect(mocks.complete).toHaveBeenCalledExactlyOnceWith(null);
    });
  });
}
