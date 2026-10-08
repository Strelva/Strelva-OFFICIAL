import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Google grant adapter: binding first, Redis fallback, dual-write on
// reconnect, encryption guard. No live Google: fetch is stubbed.

const mockGetConnection = vi.hoisted(() => vi.fn());
const mockSaveConnection = vi.hoisted(() => vi.fn());
const redis = vi.hoisted(() => ({
  get: vi.fn(), set: vi.fn(), hincrby: vi.fn(), expire: vi.fn(), hgetall: vi.fn(),
}));
vi.mock("@/lib/connections", () => ({ getConnection: mockGetConnection, saveConnection: mockSaveConnection }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => redis }));

import {
  getGoogleGrant,
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
    rpc.mockImplementation((name) => ({ data: name === "read_native_workspace_google_binding" ? bindingRow({ originTenantId: null, originTenantStableId: null }) : null, error: null }));
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
    rpc.mockImplementation((name) => ({ data: name === "read_google_binding_for_tenant" ? bindingRow() : null, error: null }));
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
  it("refreshes native grants through the same encrypted store without a Redis tenant copy", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    rpc.mockImplementation((name) => ({ data: name === "read_native_workspace_google_binding" ? bindingRow({ originTenantId: null, originTenantStableId: null }) : null, error: null }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ access_token: "fresh", expires_in: 3600, refresh_token: "rotated" }) })));
    const grant = (await getGoogleGrant(`workspace-${WORKSPACE}`))!;
    expect(await getValidGoogleAccessToken(grant, Date.parse("2026-10-08T00:00:00Z"))).toBe("fresh");
    expect(rpc).toHaveBeenCalledWith("update_workspace_account_binding_tokens", expect.objectContaining({ p_binding_id: BINDING }));
    expect(mockGetConnection).not.toHaveBeenCalled(); expect(mockSaveConnection).not.toHaveBeenCalled();
  });
  it("stores a refreshed and rotated token in the binding, encrypted, and the rotated refresh token in Redis", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    rpc.mockImplementation((name) => ({ data: name === "read_google_binding_for_tenant" ? bindingRow() : null, error: null }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ access_token: "fresh", expires_in: 3600, refresh_token: "rotated" }) })));
    const grant = (await getGoogleGrant("mooney"))!;
    expect(await getValidGoogleAccessToken(grant, Date.parse("2026-10-08T00:00:00Z"))).toBe("fresh");
    const call = rpc.mock.calls.find(([name]) => name === "update_workspace_account_binding_tokens")!;
    expect(String(call[1].p_access_ciphertext)).toMatch(/^enc:v1:/);
    expect(decryptSecret(String(call[1].p_refresh_ciphertext))).toBe("rotated");
    expect(JSON.stringify(call[1])).not.toContain("\"fresh\"");
    expect(mockSaveConnection).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: "rotated", accessToken: "access-from-redis" }));
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
    rpc.mockImplementation((name) => ({ data: name === "read_google_binding_for_tenant" ? bindingRow() : null, error: null }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, text: async () => '{"error":"invalid_grant"}' })));
    const grant = (await getGoogleGrant("mooney"))!;
    expect(await getValidGoogleAccessToken(grant, Date.parse("2026-10-08T00:00:00Z"))).toBeNull();
    expect(rpc).toHaveBeenCalledWith("set_workspace_account_binding_status", expect.objectContaining({ p_binding_id: BINDING, p_status: "needs_reauth" }));
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

  it("writes Redis as before and the binding beside it (dual-write)", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    rpc.mockImplementation((name) => ({
      data: name === "read_tenant_binding_target" ? { tenantStableId: STABLE, workspaceId: WORKSPACE }
        : name === "upsert_workspace_account_binding" ? { status: "updated", id: BINDING } : null,
      error: null,
    }));
    const result = await recordGoogleConnection(connect);
    expect(result.binding).toBe("written");
    expect(mockSaveConnection).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "mooney", refreshToken: "1//new", status: "connected" }));
    expect(redis.set).toHaveBeenCalledWith("google-meta:mooney", { accountId: "accounts/111", locationId: "333" }, expect.any(Object));
    const upsert = rpc.mock.calls.find(([name]) => name === "upsert_workspace_account_binding")!;
    expect(upsert[1].p_mode).toBe("oauth");
    expect(rpc).toHaveBeenCalledWith("upsert_workspace_google_location", expect.objectContaining({ p_binding_id: BINDING, p_location_id: "333", p_title: "The Mooney Firm" }));
  });

  it("with the store off, writes Redis only", async () => {
    expect((await recordGoogleConnection(connect)).binding).toBe("disabled");
    expect(rpc).not.toHaveBeenCalled();
    expect(mockSaveConnection).toHaveBeenCalledTimes(1);
  });

  it("skips the binding for a tenant not linked to a business", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    expect((await recordGoogleConnection(connect)).binding).toBe("unlinked");
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["read_tenant_binding_target"]);
  });

  it("never fails the connect when the binding write fails or would be plaintext", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1");
    rpc.mockImplementation((name) => name === "read_tenant_binding_target"
      ? { data: { tenantStableId: STABLE, workspaceId: WORKSPACE }, error: null }
      : { data: null, error: { message: "account_binding_tenant_not_linked" } });
    expect((await recordGoogleConnection(connect)).binding).toBe("failed");
    vi.stubEnv("SECRETS_ENC_KEY", "");
    expect((await recordGoogleConnection(connect)).binding).toBe("refused_plaintext");
    expect(mockSaveConnection).toHaveBeenCalledTimes(2);
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
