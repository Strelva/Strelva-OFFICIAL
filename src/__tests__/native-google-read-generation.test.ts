import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountBindingWithSecrets } from "@/platform/account-bindings/contracts";
import type { GoogleGrant } from "@/lib/google-access";
import type { GoogleListingClient } from "@/products/google-listing/client";
const mocks = vi.hoisted(() => ({ deps: vi.fn(), binding: vi.fn(), control: vi.fn(), grant: vi.fn(), token: vi.fn(), client: vi.fn(), provider: vi.fn(), location: vi.fn() }));
vi.mock("@/products/google-listing/tenant-replies", () => ({ defaultTenantReplyDeps: mocks.deps }));
vi.mock("@/platform/account-bindings/store", () => ({ readGoogleBindingForTenant: mocks.binding, googleBindingsEnabled: () => true }));
vi.mock("@/products/google-listing/controls", () => ({ readListingControl: mocks.control, noteListingAccess: vi.fn(), setListingPaused: vi.fn() }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: async () => false }));
vi.mock("@/platform/infra/crypto/secrets", () => ({ decryptSecret: (value: string | null) => value }));
import { tenantListingContext } from "@/products/google-listing/workspace";
import { nativeGoogleGrantGeneration } from "@/products/google-listing/native/contracts";
const workspaceId = "b8000000-0000-4000-8000-000000000001";
const bindingId = "b8000000-0000-4000-8000-000000000002";
const scope = `workspace-${workspaceId}`;
const location = { accountId: "accounts/exact", locationId: "exact" };
let binding: AccountBindingWithSecrets;
function grant(): GoogleGrant { return { source: "binding", tenantId: scope, status: "connected", scopes: binding.scopes ?? undefined, accessToken: binding.accessTokenCiphertext, refreshToken: binding.refreshTokenCiphertext, expiresAt: null, bindingId, bindingUpdatedAt: binding.updatedAt, workspaceId, location, connection: null }; }
function pin() { return { bindingId, accountId: location.accountId, grantGeneration: nativeGoogleGrantGeneration(binding) }; }
function replaceConsent() { binding = { ...binding, refreshTokenCiphertext: "replacement-refresh", accessTokenCiphertext: "replacement-access", updatedAt: "2026-10-09T01:01:00Z" }; }
function barrier() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
beforeEach(() => {
  vi.resetAllMocks();
  binding = { id: bindingId, workspaceId, provider: "google", subject: "named-principal", originTenantId: null, originTenantStableId: null, scopes: ["https://www.googleapis.com/auth/business.manage"], status: "connected", refreshTokenCiphertext: "approved-refresh", accessTokenCiphertext: "approved-access", tokenExpiresAt: null, createdAt: "2026-10-09T00:00:00Z", updatedAt: "2026-10-09T01:00:00Z", migratedFrom: "oauth", lastCheckedAt: null, lastError: null, locations: [{ ...location, title: null, isPrimary: true }] };
  mocks.binding.mockImplementation(async () => structuredClone(binding)); mocks.grant.mockImplementation(async () => grant());
  mocks.control.mockResolvedValue({ paused: false, accessPending: false }); mocks.token.mockImplementation(async (captured: GoogleGrant) => captured.accessToken);
  mocks.provider.mockResolvedValue({ ok: true, data: {} });
  mocks.client.mockImplementation(() => Object.fromEntries(["listReviews", "getReview", "getLocation", "getPost", "patchLocation", "createPost", "deletePost", "updateReply", "deleteReply"].map(key => [key, mocks.provider])) as unknown as GoogleListingClient);
  mocks.deps.mockResolvedValue({ grant: mocks.grant, accessToken: mocks.token, client: mocks.client, receipts: () => ({}), location: mocks.location });
});
describe("native Google exact consent at read dispatch", () => {
  it("refuses replacement consent after paused context preparation before token/client use", async () => {
    const wait = barrier(); const expected = pin(); let entered!: () => void; const ready = new Promise<void>(resolve => { entered = resolve; });
    mocks.control.mockImplementationOnce(async () => { entered(); await wait.promise; return { paused: false }; });
    const context = tenantListingContext(scope, workspaceId, "exact", expected);
    await ready; replaceConsent(); wait.release();
    await expect(context).rejects.toThrow(/grant|account|generation/i);
    expect(mocks.token).not.toHaveBeenCalled(); expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("refuses a new grant already present after earlier approval inspection", async () => {
    const expected = pin(); replaceConsent();
    await expect(tenantListingContext(scope, workspaceId, "exact", expected)).rejects.toThrow(/grant|account|generation/i);
    expect(mocks.token).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled();
  });
  it.each(["getPost", "getReview", "getLocation", "listReviews"] as const)("rechecks generation inside %s dispatch after an awaited recovery read", async method => {
    const ctx = await tenantListingContext(scope, workspaceId, "exact", pin());
    const wait = barrier(); mocks.grant.mockImplementationOnce(async () => { const captured = grant(); await wait.promise; return captured; });
    const read = method === "getPost" ? ctx.client.getPost("accounts/exact/locations/exact/localPosts/post") : method === "getReview" ? ctx.client.getReview(location, "review") : method === "getLocation" ? ctx.client.getLocation(location, ["metadata"]) : ctx.client.listReviews(location);
    await Promise.resolve(); replaceConsent(); wait.release();
    await expect(read).rejects.toThrow(/grant|account|generation/i);
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it.each(["account", "place", "grant_token", "source"])("rejects captured %s mismatch before token refresh", async drift => {
    const captured = grant(); const expected = pin();
    if (drift === "account") binding.locations = binding.locations.map(value => ({ ...value, accountId: "accounts/foreign" }));
    if (drift === "place") binding.locations = binding.locations.map(value => ({ ...value, locationId: "foreign" }));
    if (drift === "grant_token") captured.refreshToken = "foreign-refresh";
    if (drift === "source") captured.source = "redis";
    mocks.grant.mockResolvedValue(captured);
    await expect(tenantListingContext(scope, workspaceId, "exact", expected)).rejects.toThrow();
    expect(mocks.token).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("adopts a legitimate routine access refresh only from the same pinned native consent", async () => {
    const expected=pin();
    mocks.token.mockImplementationOnce(async (captured: GoogleGrant) => {
      binding={...binding,accessTokenCiphertext:"refreshed-access",updatedAt:"2026-10-09T01:02:00Z"};
      captured.accessToken="refreshed-access";captured.bindingUpdatedAt=binding.updatedAt;
      return "refreshed-access";
    });
    const ctx=await tenantListingContext(scope,workspaceId,"exact",expected);
    expect(pin()).toEqual(expected);expect(mocks.client).toHaveBeenCalledWith("refreshed-access");
    expect(await ctx.client.getPost("accounts/exact/locations/exact/localPosts/post")).toMatchObject({ok:true});expect(mocks.provider).toHaveBeenCalledTimes(1);
  });
  it("rejects replacement consent during a paused access refresh before client or read dispatch",async()=>{
    const expected=pin();const wait=barrier();let entered!:()=>void;const ready=new Promise<void>(resolve=>{entered=resolve;});
    mocks.token.mockImplementationOnce(async(captured:GoogleGrant)=>{entered();await wait.promise;captured.accessToken="old-consent-refreshed-access";return captured.accessToken;});
    const pending=tenantListingContext(scope,workspaceId,"exact",expected);await ready;replaceConsent();wait.release();
    await expect(pending).rejects.toThrow(/grant|generation|account/i);expect(mocks.client).not.toHaveBeenCalled();expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("rejects a returned refreshed token that differs from the current pinned binding",async()=>{
    mocks.token.mockImplementationOnce(async(captured:GoogleGrant)=>{captured.accessToken="forged-returned-access";return captured.accessToken;});
    await expect(tenantListingContext(scope,workspaceId,"exact",pin())).rejects.toThrow(/credentials/);expect(mocks.client).not.toHaveBeenCalled();expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("allows the exact pinned native grant and leaves the legacy read path unchanged", async () => {
    const ctx = await tenantListingContext(scope, workspaceId, "exact", pin());
    expect(await ctx.client.getPost("accounts/exact/locations/exact/localPosts/post")).toMatchObject({ ok: true });
    expect(mocks.client).toHaveBeenCalledWith("approved-access"); expect(mocks.provider).toHaveBeenCalledTimes(1);
    const legacy = await tenantListingContext(scope, workspaceId, "exact");
    mocks.grant.mockRejectedValue(new Error("Should not recheck a frozen legacy read"));
    expect(await legacy.client.getPost("accounts/exact/locations/exact/localPosts/post")).toMatchObject({ ok: true });
  });
});
