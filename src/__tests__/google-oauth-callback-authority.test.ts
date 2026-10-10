import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleTenantOperation } from "@/lib/google-access";

const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), permission: vi.fn(), actor: vi.fn(), state: vi.fn(), begin: vi.fn(), commit: vi.fn(), legacy: vi.fn(), fetch: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ verifyAuth: mocks.authenticated, requireTenantPermission: mocks.permission, getActorContext: mocks.actor }));
vi.mock("@/lib/oauth-state", () => ({ consumeOAuthState: mocks.state }));
vi.mock("@/lib/google-access", () => ({
  beginGoogleTenantOperation: mocks.begin, recordAuthorizedGoogleConnection: mocks.commit, recordGoogleConnection: mocks.legacy,
  googleLocationIdFromName: (name: string) => name.split("/").at(-1),
}));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => { throw new Error("No ambient database calls allowed."); } }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: () => { throw new Error("No ambient Auth calls allowed."); } }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => { throw new Error("No ambient Redis calls allowed."); } }));
import { GET } from "@/app/api/oauth/google/callback/route";

const tenant = "fictional-google-settings";
const actor = { userId: "ba000000-0000-4000-8000-000000000001", verifiedEmail: "editor@example.test" };
const operation = { tenantId: tenant, workspaceId: "ba000000-0000-4000-8000-000000000002", tenantStableId: "ba000000-0000-4000-8000-000000000003", bindingId: "ba000000-0000-4000-8000-000000000004", bindingUpdatedAt: "2026-10-09T00:00:00.000Z", locationDigest: "a".repeat(64), startedAt: "2026-10-09T00:01:00.000Z" } satisfies GoogleTenantOperation;
const callback = () => GET(new Request("https://fictional.test/api/oauth/google/callback?code=fictional-code&state=signed-fictional-state"));
const destination = (response: Response) => new URL(response.headers.get("location")!);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRELVA_NATIVE_GOOGLE_ONLY", "0"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fictional.test");
  vi.stubEnv("GOOGLE_CLIENT_ID", "fictional-client"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "fictional-secret");
  vi.stubGlobal("fetch", mocks.fetch); vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.authenticated.mockResolvedValue(true); mocks.permission.mockResolvedValue(null);
  mocks.actor.mockResolvedValue({ userId: actor.userId, email: " Editor@Example.test ", type: "user" });
  mocks.state.mockResolvedValue({ tenantId: tenant }); mocks.begin.mockResolvedValue(operation); mocks.commit.mockResolvedValue({ binding: "recorded" });
  mocks.legacy.mockImplementation(() => { throw new Error("Legacy unguarded save is forbidden."); });
  mocks.fetch.mockImplementation(async (url: string) => {
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "fictional-access", refresh_token: "fictional-refresh", expires_in: 3600, scope: "openid https://www.googleapis.com/auth/business.manage" });
    if (url === "https://mybusinessaccountmanagement.googleapis.com/v1/accounts") return Response.json({ accounts: [{ name: "accounts/fictional" }] });
    if (url === "https://mybusinessbusinessinformation.googleapis.com/v1/accounts/fictional/locations") return Response.json({ locations: [{ name: "locations/fictional-place", title: "Fictional Place" }] });
    throw new Error("Unexpected provider fixture URL.");
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("legacy Google OAuth callback current settings authority", () => {
  it("pins current actor and operation before exchange, then commits the exact returned grant after provider discovery", async () => {
    const response = await callback();
    expect(destination(response).searchParams.get("success")).toBe("true");
    expect(mocks.permission).toHaveBeenCalledWith(tenant, "settings:write"); expect(mocks.actor).toHaveBeenCalledWith(tenant);
    expect(mocks.begin).toHaveBeenCalledExactlyOnceWith(tenant, actor);
    expect(mocks.begin.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0]!);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(mocks.commit.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.fetch.mock.invocationCallOrder.at(-1)!);
    expect(mocks.commit).toHaveBeenCalledExactlyOnceWith({ tenantId: tenant, accessToken: "fictional-access", refreshToken: "fictional-refresh", expiresAt: expect.any(String), scopes: ["openid", "https://www.googleapis.com/auth/business.manage"], accountId: "accounts/fictional", locationId: "fictional-place", locationTitle: "Fictional Place" }, actor, operation);
    expect(mocks.legacy).not.toHaveBeenCalled(); expect(response.headers.get("location")).not.toContain("fictional-access");
  });

  it("refuses a viewer before any operation pin or external exchange", async () => {
    mocks.permission.mockResolvedValue(Response.json({ error: "settings denied" }, { status: 403 }));
    expect(destination(await callback()).searchParams.get("error")).toBe("Access denied");
    expect(mocks.begin).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled();
  });

  it.each(["email_unverified", "invalid_user", "dev_bypass"])("refuses %s actor despite an early permission response", async invalid => {
    mocks.actor.mockResolvedValue({ userId: invalid === "invalid_user" ? "foreign-user" : actor.userId, email: invalid === "email_unverified" ? null : actor.verifiedEmail, type: invalid === "dev_bypass" ? "system" : "user" });
    expect(destination(await callback()).searchParams.get("error")).toBe("Access denied");
    expect(mocks.begin).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("fails closed before exchange when durable connection/metadata authority is unavailable", async () => {
    mocks.begin.mockRejectedValue(new Error("qualified_durable_google_authority_required"));
    expect(destination(await callback()).searchParams.has("success")).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled(); expect(mocks.legacy).not.toHaveBeenCalled();
  });

  it.each(["settings_role_revoked", "binding_generation_changed", "tenant_link_changed"])("does not acknowledge or fall back after %s during provider reads", async reason => {
    mocks.commit.mockRejectedValue(new Error(reason));
    const response = await callback();
    expect(mocks.fetch).toHaveBeenCalledTimes(3); expect(mocks.begin).toHaveBeenCalledOnce();
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), actor, operation);
    expect(destination(response).searchParams.has("success")).toBe(false); expect(destination(response).searchParams.get("error")).toBe("Failed to connect Google account");
    expect(mocks.legacy).not.toHaveBeenCalled(); expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(reason);
  });

  it("does not commit or log a raw rejected token response", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response("fictional-token-response-secret-canary", { status: 403 }));
    expect(destination(await callback()).searchParams.has("success")).toBe(false);
    expect(mocks.commit).not.toHaveBeenCalled(); expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret-canary");
  });

  it("preserves native-only refusal before session, storage or exchange", async () => {
    vi.stubEnv("STRELVA_NATIVE_GOOGLE_ONLY", "1"); expect((await callback()).status).toBe(503);
    expect(mocks.authenticated).not.toHaveBeenCalled(); expect(mocks.begin).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
