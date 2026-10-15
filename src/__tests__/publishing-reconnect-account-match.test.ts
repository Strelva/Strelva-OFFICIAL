// Explicit approved platform access for these existing provider-flow fixtures.
vi.mock("@/platform/connections/access", () => ({readProviderAccess: () => ({provider:"google_business_profile",through:{kind:"platform"},approval:"approved"})}));
vi.mock("@/platform/connections/server", () => ({connectionEligibilityFor: async () => ({eligible:true,through:{kind:"platform"}})}));
vi.mock("@/platform/connections/holders", () => ({recordConnectionHolder: async () => {}, readConnectionHolders: async (workspaceId: string) => ({get: () => ({accountHolder:{kind:"business",workspaceId},accessThrough:{kind:"platform"}})})}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Google is a double throughout: the token endpoint and the OpenID userinfo
// endpoint are answered by a fetch stub, and any other URL fails the test.
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), release: vi.fn(), record: vi.fn(), begin: vi.fn(), upsert: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/release-flags/store", () => ({ workspaceReleaseFlagEnabled: mocks.release }));
vi.mock("@/lib/google-access", () => ({ recordGoogleConnection: mocks.record, beginGoogleReconnectOperation: mocks.begin }));
vi.mock("@/platform/account-bindings/store", () => ({ assertGoogleBindingEligible:async()=>{},googleConnectionEligibility:async()=>({eligible:true,through:{kind:"platform"}}), googleBindingsEnabled: () => true, bindingEncryptionReady: () => true, upsertGoogleBinding: mocks.upsert }));

import { finishGoogleReconnect, GoogleReconnectRefused, GOOGLE_RECONNECT_COOKIE, RECONNECT_DIFFERENT_ACCOUNT, RECONNECT_NO_IDENTITY, RECONNECT_UNKNOWN_ACCOUNT,
  reconnectHash, signReconnectToken, type ReconnectTarget } from "@/products/publishing/reconnect";
import { POST as reconnectPost } from "@/app/api/publishing/google/reconnect/route";
import { GET as reconnectCallback } from "@/app/api/publishing/google/reconnect/callback/route";

const MANAGE = "https://www.googleapis.com/auth/business.manage";
const ORIGINAL = "original-google-subject";
const target: ReconnectTarget = { id: "ad000000-0000-4000-8000-000000000011", bindingId: "ad000000-0000-4000-8000-000000000012",
  workspaceId: "ad000000-0000-4000-8000-000000000010", tenantId: "fixture-firm", tenantStableId: "ad000000-0000-4000-8000-000000000013",
  recipient: "owner@example.test", openedAt: "2026-10-05T11:00:00Z", expiresAt: "2026-10-19T11:00:00Z", noticeStatus: "accepted", subject: ORIGINAL };
const native: ReconnectTarget = { ...target, tenantId: null };
const operation = { tenantId: "fixture-firm", tenantStableId: target.tenantStableId, workspaceId: target.workspaceId, bindingId: target.bindingId,
  bindingUpdatedAt: "2026-10-05T00:00:00Z", locationDigest: "a".repeat(64), startedAt: "2026-10-06T11:00:00.000Z" };
const tokens = { access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600, scope: `openid https://www.googleapis.com/auth/userinfo.email ${MANAGE}` };

function google(userinfo: () => Response) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const href = String(url);
    if (href === "https://oauth2.googleapis.com/token") return new Response(JSON.stringify(tokens));
    if (href === "https://openidconnect.googleapis.com/v1/userinfo") return userinfo();
    throw new Error(`Unexpected provider call: ${href}`);
  });
}
const account = (sub: string, email = "someone@example.test") => () => new Response(JSON.stringify({ sub, email, email_verified: true }));
const nothingStored = () => { expect(mocks.record).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled(); };

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(Date.parse("2026-10-06T11:00:00Z")); vi.clearAllMocks();
  vi.stubEnv("OAUTH_STATE_SECRET", "fixture-signing-secret"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture-client"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-secret");
  mocks.release.mockResolvedValue(true); mocks.begin.mockResolvedValue(operation); mocks.record.mockResolvedValue({ binding: "written" });
  mocks.upsert.mockResolvedValue({ status: "updated", id: target.bindingId });
  mocks.rpc.mockImplementation(async (_name: string, args: { p_action: string }) => ({ data: args.p_action === "restored" ? { restored: true } : target, error: null }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Google reconnect restores only the originally connected Google account", () => {
  it("asks Google for the account identity on the consent screen", async () => {
    const token = signReconnectToken(target, "link");
    const begun = await reconnectPost(new Request("https://app.example.test/api/publishing/google/reconnect", { method: "POST", headers: { origin: "https://app.example.test" }, body: new URLSearchParams({ token }) }));
    expect(begun.status).toBe(303);
    const scopes = new URL(begun.headers.get("location")!).searchParams.get("scope")!.split(" ");
    expect(scopes).toEqual(expect.arrayContaining(["openid", "email", MANAGE]));
  });

  it("the same Google account restores access as before, on both the tenant and the workspace binding", async () => {
    const fetcher = google(account(ORIGINAL));
    await finishGoogleReconnect(target, "fixture-code", fetcher);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(["https://oauth2.googleapis.com/token", "https://openidconnect.googleapis.com/v1/userinfo"]);
    expect(fetcher.mock.calls[1]![1]).toMatchObject({ headers: { Authorization: "Bearer fixture-access" } });
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "fixture-firm", accessToken: "fixture-access", refreshToken: "fixture-refresh" }), expect.any(Number), operation);
    await finishGoogleReconnect(native, "fixture-code", google(account(ORIGINAL)));
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: target.workspaceId, refreshToken: "fixture-refresh", status: "connected" }), "oauth");
  });

  it("a different Google account is refused with a plain message and nothing is stored", async () => {
    for (const which of [target, native]) {
      const refused = finishGoogleReconnect(which, "fixture-code", google(account("someone-else", "attacker@example.test")));
      await expect(refused).rejects.toBeInstanceOf(GoogleReconnectRefused);
      await expect(refused).rejects.toThrow(RECONNECT_DIFFERENT_ACCOUNT);
    }
    expect(RECONNECT_DIFFERENT_ACCOUNT).toMatch(/^That's a different Google account from the one connected before\./);
    nothingStored();
  });

  it.each([
    ["no subject in the userinfo answer", () => new Response(JSON.stringify({ email: "owner@example.test" }))],
    ["an empty subject", () => new Response(JSON.stringify({ sub: "" }))],
    ["userinfo refused", () => new Response("unauthorized", { status: 401 })],
    ["a non-JSON userinfo answer", () => new Response("<html>")],
  ])("a missing Google account id (%s) is refused and nothing is stored", async (_label, userinfo) => {
    await expect(finishGoogleReconnect(target, "fixture-code", google(userinfo))).rejects.toThrow(RECONNECT_NO_IDENTITY);
    nothingStored();
  });

  it("a binding with no recorded Google account cannot be restored from the link, before any Google call", async () => {
    const fetcher = google(account(ORIGINAL));
    for (const subject of [null, undefined]) await expect(finishGoogleReconnect({ ...target, subject }, "fixture-code", fetcher)).rejects.toThrow(RECONNECT_UNKNOWN_ACCOUNT);
    expect(fetcher).not.toHaveBeenCalled(); nothingStored();
  });
});

describe("reconnect callback", () => {
  const callback = () => {
    const state = signReconnectToken(target, "state", "browser-nonce");
    const request = new NextRequest(`https://app.example.test/api/publishing/google/reconnect/callback?state=${state}&code=fixture-code`, { headers: { cookie: `${GOOGLE_RECONNECT_COOKIE}=browser-nonce` } });
    return { state, request };
  };
  const actions = () => mocks.rpc.mock.calls.map(([, args]) => args.p_action);

  it("refuses a different account, stores nothing, and reopens the episode for the same state", async () => {
    vi.stubGlobal("fetch", google(account("someone-else")));
    const { state, request } = callback();
    const response = await reconnectCallback(request);
    expect(response.status).toBe(403);
    expect(await response.text()).toContain("different Google account from the one connected before");
    expect(actions()).toEqual(["consume", "release"]);
    expect(mocks.rpc.mock.calls[1]![1]).toEqual({ p_action: "release", p_id: target.id, p_input: { stateHash: reconnectHash(state) } });
    nothingStored();
  });

  it("refuses a missing account id the same way", async () => {
    vi.stubGlobal("fetch", google(() => new Response("{}")));
    const response = await reconnectCallback(callback().request);
    expect(response.status).toBe(403); expect(await response.text()).toContain("confirm which account signed in");
    expect(actions()).toEqual(["consume", "release"]); nothingStored();
  });

  it("still shows the refusal if reopening the episode fails", async () => {
    vi.stubGlobal("fetch", google(account("someone-else")));
    mocks.rpc.mockImplementation(async (_name: string, args: { p_action: string }) => args.p_action === "release" ? { data: null, error: { message: "down" } } : { data: target, error: null });
    const response = await reconnectCallback(callback().request);
    expect(response.status).toBe(403); nothingStored();
  });

  it("the original account restores access and closes the episode as before", async () => {
    vi.stubGlobal("fetch", google(account(ORIGINAL)));
    const response = await reconnectCallback(callback().request);
    expect(response.status).toBe(200); expect(await response.text()).toContain("Google access is restored");
    expect(actions()).toEqual(["consume", "restored"]); expect(mocks.record).toHaveBeenCalledTimes(1);
  });
});
