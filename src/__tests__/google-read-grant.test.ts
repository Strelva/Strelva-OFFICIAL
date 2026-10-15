// Explicit approved platform access for these existing provider-flow fixtures.
vi.mock("@/platform/connections/access", () => ({readProviderAccess: () => ({provider:"google_business_profile",through:{kind:"platform"},approval:"approved"})}));
vi.mock("@/platform/connections/server", () => ({connectionEligibilityFor: async () => ({eligible:true,through:{kind:"platform"}})}));
vi.mock("@/platform/connections/holders", () => ({recordConnectionHolder: async () => {}, readConnectionHolders: async (workspaceId: string) => ({get: () => ({accountHolder:{kind:"business",workspaceId},accessThrough:{kind:"platform"}})})}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ grant: vi.fn(), revokeRow: vi.fn(), revokeGoogle: vi.fn(), record: vi.fn(), publishing: vi.fn() }));
vi.mock("@/products/google-listing/connect/store", async (original) => ({ ...(await original<object>()), googleReadGrant: f.grant, revokeGoogleReadGrant: f.revokeRow }));
vi.mock("@/platform/account-bindings/store", () => ({ bindingEncryptionReady: () => true, encryptForBinding: (value: string) => `enc:v1:${value}`, googleBindingsEnabled: () => true, readGoogleBindingForTenant: vi.fn() }));
vi.mock("@/platform/infra/crypto/secrets", () => ({ decryptSecret: (value: string) => value.replace(/^enc:v1:/, "") }));
vi.mock("@/platform/infra/provider-revocation", () => ({ revokeProviderAuthorization: f.revokeGoogle }));
vi.mock("@/platform/business-record/service", () => ({ readBusinessRecord: f.record, patchBusinessRecord: vi.fn() }));
vi.mock("@/products/publishing/server", () => ({ publishingEnabledForWorkspace: f.publishing }));
import { beginReadGrant, chooseReadGrantProperties, disconnectReadGrant, finishReadGrant, readGrantSummary } from "@/products/google-listing/connect/read-grant";

const WS = "11111111-1111-4111-8111-111111111111";
const owner = { userId: "10000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const GSC = "https://www.googleapis.com/auth/webmasters.readonly", GA4 = "https://www.googleapis.com/auth/analytics.readonly";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const connected = { status: "connected", googleEmail: "web@agency.test", scopes: ["openid", GSC, GA4], gscProperty: "sc-domain:bakery.example", ga4Property: "properties/42", updatedAt: "x", refreshTokenCiphertext: "enc:v1:refresh", accessTokenCiphertext: "enc:v1:access", tokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString() };

beforeEach(() => {
  for (const mock of Object.values(f)) mock.mockReset();
  f.record.mockResolvedValue({ access: "owner" }); f.publishing.mockResolvedValue(true);
  vi.stubEnv("STRELVA_GOOGLE_READ_GRANT", "1"); vi.stubEnv("OAUTH_STATE_SECRET", "fixture-private-secret");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test"); vi.stubEnv("GOOGLE_CLIENT_ID", "fixture-client"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-secret");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function begin() { const started = await beginReadGrant(owner, WS, "https://app.example.test"); return { ...started, state: new URL(started.url).searchParams.get("state")! }; }

describe("Search Console and Analytics as their own read-only grant", () => {
  it("asks only for read scopes in its own consent, never widening the listing grant", async () => {
    const url = new URL((await begin()).url);
    expect(url.searchParams.get("scope")).toBe(`openid email ${GSC} ${GA4}`);
    expect(url.searchParams.get("scope")).not.toContain("business.manage");
    expect(url.searchParams.has("include_granted_scopes")).toBe(false);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.test/api/workspace/google/read-grant/callback");
  });
  it("is closed with the flag off and to anyone but the owner", async () => {
    vi.stubEnv("STRELVA_GOOGLE_READ_GRANT", "");
    await expect(beginReadGrant(owner, WS, "https://app.example.test")).rejects.toThrow("aren't open");
    vi.stubEnv("STRELVA_GOOGLE_READ_GRANT", "1"); f.record.mockResolvedValue({ access: "member" });
    await expect(beginReadGrant(owner, WS, "https://app.example.test")).rejects.toThrow("Only the business owner");
  });
  it("stores the granted read scopes, encrypted, with the Google account that granted them", async () => {
    const { state, nonce } = await begin();
    const fetcher = vi.fn().mockResolvedValueOnce(json({ access_token: "a", refresh_token: "r", scope: `openid ${GSC}`, expires_in: 3599 })).mockResolvedValueOnce(json({ sub: "g-9", email: "Web@Agency.test", email_verified: true }));
    expect(await finishReadGrant(owner, state, nonce, "code", "https://app.example.test", { fetcher: fetcher as unknown as typeof fetch })).toEqual({ status: "connected", workspaceId: WS });
    expect(f.grant).toHaveBeenCalledWith(owner, WS, "save", expect.objectContaining({ subject: "g-9", googleEmail: "web@agency.test", scopes: ["openid", GSC], refreshTokenCiphertext: "enc:v1:r", accessTokenCiphertext: "enc:v1:a" }));
  });
  it("refuses and stores nothing if Google returns anything beyond read, or no read scope", async () => {
    for (const scope of [`openid ${GSC} https://www.googleapis.com/auth/business.manage`, "openid email"]) {
      const { state, nonce } = await begin();
      const fetcher = vi.fn().mockResolvedValueOnce(json({ access_token: "a", refresh_token: "r", scope, expires_in: 3599 }));
      expect((await finishReadGrant(owner, state, nonce, "code", "https://app.example.test", { fetcher: fetcher as unknown as typeof fetch })).status).toBe("refused");
    }
    expect(f.grant).not.toHaveBeenCalled();
  });
  it("reads the 28-day summary and degrades to unavailable on 403 or quota 0, never throwing", async () => {
    f.grant.mockImplementation(async (_actor: unknown, _ws: string, action: string) => action === "read" ? { ...connected, refreshTokenCiphertext: undefined } : connected);
    const google = vi.fn(async (url: string) => String(url).includes("searchAnalytics")
      ? json({ rows: [{ keys: ["bakery buffalo"], clicks: 12, impressions: 340, ctr: 0.035, position: 8.2 }] })
      : json({ reports: [{ rows: [{ metricValues: [{ value: "30" }, { value: "41" }, { value: "77" }] }] }, { rows: [] }, { rows: [] }] }));
    vi.stubGlobal("fetch", google);
    const summary = await readGrantSummary(owner, WS);
    expect(summary).toMatchObject({ gsc: { status: "ok", totals: { clicks: 12, impressions: 340 } }, ga4: { status: "ok", report: { users: 30, sessions: 41, pageviews: 77 } } });
    expect(google.mock.calls.every(call => String((call as unknown as [string, RequestInit])[1]?.headers && JSON.stringify((call as unknown as [string, RequestInit])[1].headers)).includes("Bearer access"))).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":{"code":429,"message":"limit of 0"}}', { status: 429 })));
    expect(await readGrantSummary(owner, WS)).toEqual({ gsc: { status: "unavailable" }, ga4: { status: "unavailable" } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    expect(await readGrantSummary(owner, WS)).toEqual({ gsc: { status: "unavailable" }, ga4: { status: "unavailable" } });
  });
  it("only lets the owner choose a site the connected account can see", async () => {
    f.grant.mockResolvedValue(connected);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("webmasters") ? json({ siteEntry: [{ siteUrl: "sc-domain:bakery.example", permissionLevel: "siteOwner" }] }) : json({ accountSummaries: [] })));
    await chooseReadGrantProperties(owner, WS, { gscProperty: "sc-domain:bakery.example" });
    expect(f.grant).toHaveBeenLastCalledWith(owner, WS, "select", { gscProperty: "sc-domain:bakery.example" });
    await expect(chooseReadGrantProperties(owner, WS, { gscProperty: "sc-domain:someone-else.example" })).rejects.toThrow("isn't on the connected account");
  });
  it("disconnects on its own: clears stored tokens, then revokes at Google", async () => {
    f.revokeRow.mockResolvedValue("enc:v1:refresh"); f.revokeGoogle.mockResolvedValue({ outcome: "revoked", errorCode: null });
    expect(await disconnectReadGrant(owner, WS)).toBe("revoked");
    expect(f.revokeGoogle).toHaveBeenCalledWith("google", "refresh");
    f.revokeGoogle.mockResolvedValue({ outcome: "failed", errorCode: "x" });
    expect(await disconnectReadGrant(owner, WS)).toBe("revoked_locally");
  });
});
