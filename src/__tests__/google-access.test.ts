import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Google grant adapter: binding first, Redis fallback, dual-write on
// reconnect, encryption guard. No live Google: fetch is stubbed.

const mockGetConnection = vi.hoisted(() => vi.fn());
const mockSaveConnection = vi.hoisted(() => vi.fn());
const mockSaveConnectionMutation = vi.hoisted(() => vi.fn());
const mockDurableAuthority = vi.hoisted(() => vi.fn());
vi.mock("@/lib/client-records", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/client-records")>(), durableRecordAuthority: mockDurableAuthority,
}));
const redis = vi.hoisted(() => ({
  get: vi.fn(), set: vi.fn(), hincrby: vi.fn(), expire: vi.fn(), hgetall: vi.fn(),
}));
vi.mock("@/lib/connections", () => ({ getConnection: mockGetConnection, saveConnection: mockSaveConnection, saveConnectionMutation: mockSaveConnectionMutation }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => redis }));

import {
  getGoogleGrant,
  markGoogleGrantNeedsReauth,
  getGoogleLocation,
  getValidGoogleAccessToken,
  googleLocationIdFromName,
  recordGoogleConnection,
  readGoogleBindingFallbacks,
} from "@/lib/google-access";
import { connectionHasWriteScope } from "@/lib/gbp-replies";
import { encryptSecret, decryptSecret } from "@/platform/infra/crypto/secrets";
import { encryptForBinding, setAccountBindingsDb, upsertGoogleBinding, BindingEncryptionRefused } from "@/platform/account-bindings/store";

const WORKSPACE = "ab000000-0000-4000-8000-000000000010";
const STABLE = "ab000000-0000-4000-8000-0000000000b1";
const BINDING = "ab000000-0000-4000-8000-0000000000d1";

type Rpc = (name: string, args: Record<string, unknown>) => { data: unknown; error: { message?: string; code?: string } | null };
let rpc: ReturnType<typeof vi.fn<Rpc>>;

function bindingRow(over: Record<string, unknown> = {}) {
  return {
    id: BINDING, workspaceId: WORKSPACE, provider: "google", subject: null, originTenantStableId: STABLE, originTenantId: "mooney",
    scopes: ["https://www.googleapis.com/auth/business.manage"], tokenExpiresAt: "2026-10-07T18:00:00.000Z", status: "connected",
    lastCheckedAt: null, lastError: null, migratedFrom: "redis", createdAt: "2026-10-06T00:00:00Z", updatedAt: "2026-10-06T00:00:00Z",
    locations: [{ accountId: "accounts/111", locationId: "333", title: "The Mooney Firm", isPrimary: true }],
    refreshTokenCiphertext: encryptSecret("refresh-from-binding"), accessTokenCiphertext: encryptSecret("access-from-binding"),
    ...over,
  };
}

const redisConnection = {
  provider: "google", tenantId: "mooney", accessToken: "access-from-redis", refreshToken: "refresh-from-redis",
  expiresAt: "2020-01-01T00:00:00.000Z", status: "connected", scopes: undefined,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SECRETS_ENC_KEY", "test-only-binding-key");
  vi.stubEnv("GOOGLE_CLIENT_ID", "client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  rpc = vi.fn<Rpc>(() => ({ data: null, error: null }));
  setAccountBindingsDb({ rpc: async (name, args) => rpc(name, args) });
  mockGetConnection.mockResolvedValue(redisConnection);
  mockSaveConnection.mockResolvedValue(undefined);
  mockSaveConnectionMutation.mockResolvedValue(undefined);
  mockDurableAuthority.mockResolvedValue(false);
  redis.get.mockResolvedValue({ accountId: "accounts/9", locationId: "77" });
});

afterEach(() => {
  setAccountBindingsDb(undefined);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("reading the grant", () => {
  it("reads native workspace grants and fails closed without a tenant Redis fallback", async () => {
    const scope = `workspace-${WORKSPACE}`;
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    rpc.mockImplementation((name) => ({ data: name === "read_native_workspace_google_binding" ? bindingRow({ originTenantId: null, originTenantStableId: null }) : name === "mutate_google_binding_generation" ? "2026-10-08T00:00:01Z" : null, error: null }));
    expect(await getGoogleGrant(scope)).toMatchObject({ source: "binding", workspaceId: WORKSPACE, bindingId: BINDING });
    expect(rpc).toHaveBeenCalledWith("read_native_workspace_google_binding", { p_workspace_id: WORKSPACE });
    expect(mockGetConnection).not.toHaveBeenCalled();
    rpc.mockImplementation(() => ({ data: null, error: null }));
    expect(await getGoogleGrant(scope)).toBeNull();
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "0");
    expect(await getGoogleGrant(scope)).toBeNull();
    expect(mockGetConnection).not.toHaveBeenCalled();
    expect(redis.hincrby).not.toHaveBeenCalled();
  });
  it("with the binding store off, reads Redis only and never calls Postgres", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "");
    const grant = await getGoogleGrant("mooney");
    expect(grant?.source).toBe("redis");
    expect(grant?.accessToken).toBe("access-from-redis");
    expect(rpc).not.toHaveBeenCalled();
    expect(await getGoogleLocation("mooney", grant)).toEqual({ accountId: "accounts/9", locationId: "77" });
  });

  it("with the store on, reads the binding first, decrypts it and uses its location", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    rpc.mockImplementation((name) => ({ data: name === "read_google_binding_for_tenant" ? bindingRow() : name === "mutate_google_binding_generation" ? "2026-10-08T00:00:01Z" : null, error: null }));
    const grant = await getGoogleGrant("mooney");
    expect(grant).toMatchObject({ source: "binding", bindingId: BINDING, workspaceId: WORKSPACE, refreshToken: "refresh-from-binding" });
    expect(mockGetConnection).not.toHaveBeenCalled();
    expect(await getGoogleLocation("mooney", grant)).toEqual({ accountId: "accounts/111", locationId: "333" });
    expect(redis.get).not.toHaveBeenCalled();
  });

  it("falls back to Redis when there is no binding, and counts the fallback", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    const grant = await getGoogleGrant("mooney");
    expect(grant?.source).toBe("redis");
    expect(redis.hincrby).toHaveBeenCalledWith(expect.stringMatching(/^reb:google-binding:fallback:\d{4}-\d{2}-\d{2}$/), "no_binding", 1);
  });

  it("falls back to Redis when the migration is not applied", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    rpc.mockReturnValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    const grant = await getGoogleGrant("mooney");
    expect(grant?.source).toBe("redis");
    expect(redis.hincrby).toHaveBeenCalledWith(expect.any(String), "schema_missing", 1);
  });

  it("falls back when a ciphertext can't be decrypted here (no key)", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    rpc.mockReturnValue({ data: bindingRow(), error: null });
    vi.stubEnv("SECRETS_ENC_KEY", "");
    const grant = await getGoogleGrant("mooney");
    expect(grant?.source).toBe("redis");
    expect(redis.hincrby).toHaveBeenCalledWith(expect.any(String), "decrypt_failed", 1);
  });

  it("keeps a scope-less legacy grant as 'attempt the write'", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    rpc.mockReturnValue({ data: bindingRow({ scopes: null }), error: null });
    const grant = await getGoogleGrant("mooney");
    expect(grant?.scopes).toBeUndefined();
    expect(connectionHasWriteScope(grant?.scopes)).toBe(true);
  });

  it("reads a revoked binding as disconnected", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    rpc.mockReturnValue({ data: bindingRow({ status: "revoked" }), error: null });
    expect((await getGoogleGrant("mooney"))?.status).toBe("disconnected");
  });

  it("reports fallback counts by day", async () => {
    redis.hgetall.mockResolvedValueOnce({ no_binding: "3" }).mockResolvedValue(null);
    const days = await readGoogleBindingFallbacks(2, Date.parse("2026-10-06T12:00:00Z"));
    expect(days).toEqual([{ date: "2026-10-06", counts: { no_binding: 3 } }, { date: "2026-10-05", counts: {} }]);
  });
});

describe("refreshing tokens", () => {
  it("refuses a refreshed token when a disconnect superseded its original grant", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "");
    let release!: (response: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { release = resolve; })));
    const grant = (await getGoogleGrant("mooney"))!;
    const originalToken = grant.accessToken;
    const refresh = getValidGoogleAccessToken(grant);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    mockSaveConnectionMutation.mockRejectedValueOnce(new Error("Connection mutation was superseded or revoked."));
    release({ ok: true, json: async () => ({ access_token: "stale-fresh", refresh_token: "stale-rotated" }) });
    expect(await refresh).toBeNull();
    expect(grant.accessToken).toBe(originalToken);
    expect(mockSaveConnection).not.toHaveBeenCalled();
    expect(mockSaveConnectionMutation).toHaveBeenCalledWith(redisConnection, expect.any(Object), grant.mutationStartedAt);
  });
  it("does not mark a revoked connection needs_reauth through a retained grant", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "");
    const grant = (await getGoogleGrant("mooney"))!;
    mockSaveConnectionMutation.mockRejectedValueOnce(new Error("Connection mutation was superseded or revoked."));
    await expect(markGoogleGrantNeedsReauth(grant, "invalid grant")).rejects.toThrow(/superseded/);
    expect(mockSaveConnection).not.toHaveBeenCalled();
    expect(mockSaveConnectionMutation).toHaveBeenCalledWith(redisConnection, { status: "needs_reauth" }, grant.mutationStartedAt);
  });
  it("refreshes native grants through the same encrypted store without a Redis tenant copy", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    rpc.mockImplementation((name) => ({ data: name === "read_native_workspace_google_binding" ? bindingRow({ originTenantId: null, originTenantStableId: null }) : name === "mutate_google_binding_generation" ? "2026-10-08T00:00:01Z" : null, error: null }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ access_token: "fresh", expires_in: 3600, refresh_token: "rotated" }) })));
    const grant = (await getGoogleGrant(`workspace-${WORKSPACE}`))!;
    expect(await getValidGoogleAccessToken(grant, Date.parse("2026-10-08T00:00:00Z"))).toBe("fresh");
    expect(rpc).toHaveBeenCalledWith("mutate_google_binding_generation", expect.objectContaining({ p_binding_id: BINDING }));
    expect(mockGetConnection).not.toHaveBeenCalled(); expect(mockSaveConnection).not.toHaveBeenCalled();
  });
  it("stores a refreshed and rotated token in the binding, encrypted, and the rotated refresh token in Redis", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    rpc.mockImplementation((name) => ({ data: name === "read_google_binding_for_tenant" ? bindingRow() : name === "mutate_google_binding_generation" ? "2026-10-08T00:00:01Z" : null, error: null }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ access_token: "fresh", expires_in: 3600, refresh_token: "rotated" }) })));
    const grant = (await getGoogleGrant("mooney"))!;
    expect(await getValidGoogleAccessToken(grant, Date.parse("2026-10-08T00:00:00Z"))).toBe("fresh");
    const call = rpc.mock.calls.find(([name]) => name === "mutate_google_binding_generation")!;
    expect(String((call[1].p_mutation as Record<string,unknown>).accessTokenCiphertext)).toMatch(/^enc:v1:/);
    expect(decryptSecret(String((call[1].p_mutation as Record<string,unknown>).refreshTokenCiphertext))).toBe("rotated");
    expect(JSON.stringify(call[1])).not.toContain("\"fresh\"");
    expect(mockSaveConnectionMutation).toHaveBeenCalledWith(redisConnection, { refreshToken: "rotated" }, expect.any(String));
  });

  it("refuses a refreshed native token after the binding generation was revoked", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    rpc.mockImplementation(name => ({ data: name === "read_native_workspace_google_binding" ? bindingRow() : null, error: name === "mutate_google_binding_generation" ? { message: "account_binding_superseded_or_revoked" } : null }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ access_token: "stale-native" }) })));
    const grant = (await getGoogleGrant(`workspace-${WORKSPACE}`))!;
    expect(await getValidGoogleAccessToken(grant)).toBeNull();
    expect(grant.accessToken).toBe("access-from-binding");
    expect(mockSaveConnection).not.toHaveBeenCalled();
  });
  it("reuses a stored access token that is still good", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const grant = (await getGoogleGrant("mooney"))!;
    grant.expiresAt = "2026-10-08T01:00:00.000Z";
    expect(await getValidGoogleAccessToken(grant, Date.parse("2026-10-08T00:00:00Z"))).toBe("access-from-redis");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("marks the binding needs_reauth when Google refuses the refresh token", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    rpc.mockImplementation((name) => ({ data: name === "read_google_binding_for_tenant" ? bindingRow() : name === "mutate_google_binding_generation" ? "2026-10-08T00:00:01Z" : null, error: null }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, text: async () => '{"error":"invalid_grant"}' })));
    const grant = (await getGoogleGrant("mooney"))!;
    expect(await getValidGoogleAccessToken(grant, Date.parse("2026-10-08T00:00:00Z"))).toBeNull();
    expect(rpc).toHaveBeenCalledWith("mutate_google_binding_generation", expect.objectContaining({ p_binding_id: BINDING, p_expected_updated_at: "2026-10-06T00:00:00Z", p_mutation: expect.objectContaining({ status: "needs_reauth" }) }));
  });
});

describe("the encryption guard", () => {
  it("refuses to produce a binding value without SECRETS_ENC_KEY", () => {
    vi.stubEnv("SECRETS_ENC_KEY", "");
    expect(() => encryptForBinding("1//refresh")).toThrow(BindingEncryptionRefused);
    expect(encryptForBinding(null)).toBeNull();
  });

  it("refuses the whole upsert before any database call", async () => {
    vi.stubEnv("SECRETS_ENC_KEY", "");
    await expect(upsertGoogleBinding({ workspaceId: WORKSPACE, originTenantStableId: STABLE, refreshToken: "1//r", status: "connected" }, "copy"))
      .rejects.toThrow(BindingEncryptionRefused);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends only envelopes and keeps null scopes null", async () => {
    rpc.mockReturnValue({ data: { status: "created", id: BINDING }, error: null });
    await upsertGoogleBinding({ workspaceId: WORKSPACE, originTenantStableId: STABLE, refreshToken: "1//r", accessToken: "ya29.a", status: "connected" }, "copy");
    const input = rpc.mock.calls[0]![1].p_input as Record<string, unknown>;
    expect(input.refreshTokenCiphertext).toMatch(/^enc:v1:/);
    expect(input.accessTokenCiphertext).toMatch(/^enc:v1:/);
    expect(input.scopes).toBeNull();
    expect(JSON.stringify(input)).not.toMatch(/1\/\/r|ya29\.a/);
  });
});

describe("recording a (re)connect", () => {
  const connect = { tenantId: "mooney", accessToken: "ya29.new", refreshToken: "1//new", expiresAt: "2026-10-07T19:00:00.000Z",
    scopes: ["https://www.googleapis.com/auth/business.manage"], accountId: "accounts/111", locationId: "333", locationTitle: "The Mooney Firm" };

  it("commits qualified credentials, metadata and binding without legacy/cache writes", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    mockDurableAuthority.mockResolvedValue(true);
    rpc.mockImplementation((name) => ({
      data: name === "read_legacy_google_operation" ? { tenantId: "mooney", tenantStableId: STABLE, workspaceId: WORKSPACE, bindingId: BINDING, bindingUpdatedAt: "2026-10-08T00:00:00Z", locationDigest: "a".repeat(64), startedAt: new Date().toISOString() }
        : name === "commit_legacy_google_binding_operation" ? { status: "applied", bindingId: BINDING } : null,
      error: null,
    }));
    const result = await recordGoogleConnection(connect);
    expect(result.binding).toBe("written");
    expect(mockSaveConnection).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["read_legacy_google_operation", "commit_legacy_google_binding_operation"]);
    const committed = rpc.mock.calls.find(([name]) => name === "commit_legacy_google_binding_operation")!;
    expect(JSON.stringify(committed[1])).toContain("The Mooney Firm");
    expect(JSON.stringify(committed[1])).not.toContain("1//new");
  });

  it("with the store off, writes Redis only", async () => {
    expect((await recordGoogleConnection(connect)).binding).toBe("disabled");
    expect(rpc).not.toHaveBeenCalled();
    expect(mockSaveConnection).toHaveBeenCalledTimes(1);
  });

  it("persists qualified unlinked records atomically without creating a binding", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    mockDurableAuthority.mockResolvedValue(true);
    rpc.mockImplementation(name => ({ data: name === "read_legacy_google_operation" ? { tenantId: "mooney", tenantStableId: STABLE, workspaceId: null, bindingId: null, bindingUpdatedAt: null, locationDigest: null, startedAt: new Date().toISOString() } : { status: "applied", bindingId: null }, error: null }));
    expect((await recordGoogleConnection(connect)).binding).toBe("unlinked");
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["read_legacy_google_operation", "commit_legacy_google_binding_operation"]);
    expect(mockSaveConnection).not.toHaveBeenCalled();
  });

  it("reports failure or refused encryption without independent credential writes", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    mockDurableAuthority.mockResolvedValue(true);
    rpc.mockImplementation((name) => name === "read_legacy_google_operation"
      ? { data: { tenantId: "mooney", tenantStableId: STABLE, workspaceId: WORKSPACE, bindingId: BINDING, bindingUpdatedAt: "2026-10-08T00:00:00Z", locationDigest: "a".repeat(64), startedAt: new Date().toISOString() }, error: null }
      : { data: null, error: { message: "account_binding_tenant_not_linked" } });
    expect((await recordGoogleConnection(connect)).binding).toBe("failed");
    vi.stubEnv("SECRETS_ENC_KEY", "");
    expect((await recordGoogleConnection(connect)).binding).toBe("refused_plaintext");
    expect(mockSaveConnection).not.toHaveBeenCalled();
  });

  it("still fails the connect when Redis itself fails, as before", async () => {
    mockSaveConnection.mockRejectedValueOnce(new Error("redis down"));
    await expect(recordGoogleConnection(connect)).rejects.toThrow("redis down");
  });
});

describe("Google resource names", () => {
  it("reads both v1 and older location names", () => {
    expect(googleLocationIdFromName("locations/456")).toBe("456");
    expect(googleLocationIdFromName("accounts/1/locations/456")).toBe("456");
    expect(googleLocationIdFromName("locations/../x")).toBeUndefined();
    expect(googleLocationIdFromName(undefined)).toBeUndefined();
  });
});

it("dispatch accepts this operation's admitted refresh and rejects a same-ID reconnect generation",async()=>{
 const {assertGoogleDispatchGrant}=await import("@/products/google-listing/dispatch-grant");
 const {accountBindingWithSecretsSchema}=await import("@/platform/account-bindings/contracts");
 vi.stubEnv("STRELVA_GOOGLE_BINDINGS","1");
 const scope=`workspace-${WORKSPACE}`;
 let saved=bindingRow({originTenantId:null,originTenantStableId:null});
 rpc.mockImplementation((name,args)=>{
  if(name==="read_native_workspace_google_binding")return {data:saved,error:null};
  if(name==="mutate_google_binding_generation"){
   if(args.p_expected_updated_at!==saved.updatedAt)return {data:null,error:{message:"account_binding_superseded_or_revoked"}};
   saved={...saved,...args.p_mutation as Record<string,unknown>,updatedAt:"2026-10-08T00:00:01.123456+00:00"};
   return {data:saved.updatedAt,error:null};
  }
  return {data:null,error:null};
 });
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({access_token:"admitted-refreshed",refresh_token:"admitted-rotated",expires_in:3600})})));
 const captured=await getGoogleGrant(scope);expect(captured).not.toBeNull();
 const priorGeneration=captured!.bindingUpdatedAt;
 expect(await getValidGoogleAccessToken(captured!,Date.parse("2026-10-08T00:00:00Z"))).toBe("admitted-refreshed");
 expect(captured).toMatchObject({accessToken:"admitted-refreshed",refreshToken:"admitted-rotated",bindingUpdatedAt:saved.updatedAt});
 expect(captured!.bindingUpdatedAt).not.toBe(priorGeneration);
 const current=await getGoogleGrant(scope);
 expect(()=>assertGoogleDispatchGrant(captured!,current,accountBindingWithSecretsSchema.parse(saved),WORKSPACE,"333")).not.toThrow();
 // Formatting can differ across RPC readers; fractional generation cannot.
 expect(()=>assertGoogleDispatchGrant({...captured!,bindingUpdatedAt:"2026-10-08T00:00:01.123456Z"},current,accountBindingWithSecretsSchema.parse(saved),WORKSPACE,"333")).not.toThrow();
 saved={...saved,updatedAt:"2026-10-08T00:00:01.123457+00:00"};
 expect(()=>assertGoogleDispatchGrant(captured!,current,accountBindingWithSecretsSchema.parse(saved),WORKSPACE,"333")).toThrow(/generation changed/);
 saved={...saved,accessTokenCiphertext:encryptSecret("reconnected-access"),refreshTokenCiphertext:encryptSecret("reconnected-refresh")};
 const reconnected=await getGoogleGrant(scope);
 expect(()=>assertGoogleDispatchGrant(captured!,reconnected,accountBindingWithSecretsSchema.parse(saved),WORKSPACE,"333")).toThrow(/grant changed/);
});
