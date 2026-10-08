import { describe, expect, it, vi } from "vitest";
import type { Connection, IntegrationProvider } from "@/lib/types";
import { disconnectTenantProvider, type ProviderDisconnectDependencies } from "@/lib/provider-disconnect";
import { revokeProviderAuthorization } from "@/platform/infra/provider-revocation";

const responseOk = () => new Response(null, { status: 200 });

describe("provider authorization revocation", () => {
  it("revokes Google refresh tokens through the OAuth endpoint", async () => {
    const fetcher = vi.fn(async () => responseOk());
    await expect(revokeProviderAuthorization("google", "fixture-google-token", fetcher)).resolves.toEqual({ outcome: "revoked", errorCode: null });
    expect(fetcher).toHaveBeenCalledWith("https://oauth2.googleapis.com/revoke", expect.objectContaining({
      method: "POST", body: "token=fixture-google-token", headers: expect.objectContaining({ "Content-Type": "application/x-www-form-urlencoded" }),
    }));
  });

  it("records Instagram as unsupported because the configured Basic Display grant has no supported app-initiated revoke endpoint", async () => {
    const fetcher = vi.fn(async () => responseOk());
    await expect(revokeProviderAuthorization("instagram", "fixture-instagram-token", fetcher)).resolves.toEqual({ outcome: "unsupported", errorCode: null });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("revokes Calendly OAuth tokens with the configured client credentials", async () => {
    vi.stubEnv("CALENDLY_CLIENT_ID", "fixture-client");
    vi.stubEnv("CALENDLY_CLIENT_SECRET", "fixture-secret");
    const fetcher = vi.fn(async () => responseOk());
    try {
      await expect(revokeProviderAuthorization("calendly", "fixture-calendly-token", fetcher)).resolves.toEqual({ outcome: "revoked", errorCode: null });
      expect(fetcher).toHaveBeenCalledWith("https://auth.calendly.com/oauth/revoke", expect.objectContaining({
        method: "POST", body: "client_id=fixture-client&client_secret=fixture-secret&token=fixture-calendly-token",
      }));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ["yelp", "unsupported"],
    ["vegaro", "unsupported"],
    ["outlook", "consent_remains"],
  ] as const)("records %s without making an unsupported provider call", async (provider, outcome) => {
    const fetcher = vi.fn(async () => responseOk());
    await expect(revokeProviderAuthorization(provider, "fixture-token", fetcher)).resolves.toMatchObject({ outcome });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports provider failures with a safe code and never returns credential text", async () => {
    const fetcher = vi.fn(async () => { throw new Error("fixture-google-token leaked by transport"); });
    const result = await revokeProviderAuthorization("google", "fixture-google-token", fetcher);
    expect(result).toEqual({ outcome: "failed", errorCode: "request_failed" });
    expect(JSON.stringify(result)).not.toContain("fixture-google-token");
  });
});

function fakeConnection(provider: IntegrationProvider, accessToken = "fixture-access", refreshToken?: string): Connection {
  return { provider, tenantId: "fixture-tenant", accessToken, refreshToken, status: "connected" };
}

function dependencies(overrides: Partial<ProviderDisconnectDependencies> = {}) {
  return {
    readConnection: vi.fn(async (_tenantId: string, provider: IntegrationProvider) => fakeConnection(provider)),
    deleteConnection: vi.fn(async () => true),
    readGoogleBindings: vi.fn(async () => ({ bindings: [], error: false })),
    clearTenantConfigCache: vi.fn(async () => true),
    revoke: vi.fn(async (provider: IntegrationProvider) => ({ outcome: provider === "yelp" || provider === "vegaro" ? "unsupported" as const : "revoked" as const, errorCode: null })),
    record: vi.fn(async (input) => ({ id: "receipt-1", provider: input.provider, revocationOutcome: input.revocationOutcome, revocationErrorCode: input.revocationErrorCode, localCleanupStatus: input.localCleanupStatus, clearedStores: input.clearedStores })),
    ...overrides,
  } satisfies ProviderDisconnectDependencies;
}

describe("tenant provider disconnect", () => {
  it.each(["google", "instagram", "yelp", "calendly", "vegaro"] as const)("runs the %s path and always writes its receipt after local deletion", async (provider) => {
    const deps = dependencies();
    const receipt = await disconnectTenantProvider({ tenantId: "fixture-tenant", provider }, deps);
    expect(deps.deleteConnection).toHaveBeenCalledWith("fixture-tenant", provider);
    expect(deps.record).toHaveBeenCalledWith(expect.objectContaining({
      provider,
      localCleanupStatus: "complete",
      clearedStores: provider === "instagram" ? [`redis_connection:${provider}`, "tenant_config_cache"] : [`redis_connection:${provider}`],
    }));
    if (provider === "instagram") expect(deps.clearTenantConfigCache).toHaveBeenCalledTimes(2);
    expect(receipt.id).toBe("receipt-1");
  });

  it("reads tenant and native Google bindings, deduplicates matching credentials, and clears both stores", async () => {
    const deps = dependencies({
      readConnection: vi.fn(async () => fakeConnection("google", "fixture-access", "shared-refresh")),
      readGoogleBindings: vi.fn(async () => ({ bindings: [
        { accessToken: "fixture-access", refreshToken: "shared-refresh" },
        { accessToken: "native-access", refreshToken: "native-refresh" },
      ], error: false })),
    });
    await disconnectTenantProvider({ tenantId: "fixture-tenant", provider: "google" }, deps);
    expect(deps.revoke).toHaveBeenCalledTimes(2);
    expect(deps.revoke).toHaveBeenNthCalledWith(1, "google", "shared-refresh");
    expect(deps.revoke).toHaveBeenNthCalledWith(2, "google", "native-refresh");
    expect(deps.record).toHaveBeenCalledWith(expect.objectContaining({
      provider: "google", revocationOutcome: "revoked", localCleanupStatus: "complete",
    }));
  });

  it("does not let provider failure block local cleanup or receipt writing", async () => {
    const deps = dependencies({
      revoke: vi.fn(async () => ({ outcome: "failed" as const, errorCode: "http_503" })),
    });
    await disconnectTenantProvider({ tenantId: "fixture-tenant", provider: "instagram" }, deps);
    expect(deps.deleteConnection).toHaveBeenCalledOnce();
    expect(deps.record).toHaveBeenCalledWith(expect.objectContaining({ revocationOutcome: "failed", revocationErrorCode: "http_503" }));
  });

  it("does not let a rejected provider adapter block local cleanup or receipt writing", async () => {
    const deps = dependencies({ revoke: vi.fn(async () => { throw new Error("fixture transport failure"); }) });
    const receipt = await disconnectTenantProvider({ tenantId: "fixture-tenant", provider: "calendly" }, deps);
    expect(receipt.id).toBe("receipt-1");
    expect(deps.deleteConnection).toHaveBeenCalledOnce();
    expect(deps.record).toHaveBeenCalledWith(expect.objectContaining({ revocationOutcome: "failed", revocationErrorCode: "request_failed" }));
  });

  it("records incomplete local cleanup when Redis is unavailable", async () => {
    const deps = dependencies({ deleteConnection: vi.fn(async () => false) });
    const receipt = await disconnectTenantProvider({ tenantId: "fixture-tenant", provider: "yelp" }, deps);
    expect(receipt.localCleanupStatus).toBe("partial");
    expect(deps.record).toHaveBeenCalledWith(expect.objectContaining({ localCleanupStatus: "partial", clearedStores: [] }));
  });

  it("records incomplete Instagram cleanup when its legacy tenant-token cache cannot be invalidated", async () => {
    const deps = dependencies({ clearTenantConfigCache: vi.fn(async () => false) });
    const receipt = await disconnectTenantProvider({ tenantId: "fixture-tenant", provider: "instagram" }, deps);
    expect(receipt.localCleanupStatus).toBe("partial");
    expect(deps.record).toHaveBeenCalledWith(expect.objectContaining({ localCleanupStatus: "partial", clearedStores: ["redis_connection:instagram"] }));
  });
});
