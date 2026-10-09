import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LegacyGoogleOperationPin } from "@/lib/workspace-ports";
const state = vi.hoisted(() => ({ snapshot: vi.fn(), apply: vi.fn(), commit: vi.fn(), durable: vi.fn(), cache: vi.fn(), save: vi.fn(), metadata: vi.fn() }));
vi.mock("@/lib/connections", () => ({ saveConnection: state.save, getConnection: vi.fn(), saveConnectionMutation: vi.fn() }));
vi.mock("@/lib/client-records", () => ({ durableRecordAuthority: state.durable, writeDurableRecord: state.metadata, mirrorRecord: vi.fn(), readProviderMetadata: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => ({ set: state.cache }) }));
vi.mock("@/platform/account-bindings/store", () => ({
  googleBindingsEnabled: () => process.env.STRELVA_GOOGLE_BINDINGS === "1",
  readLegacyGoogleOperation: state.snapshot, applyLegacyGoogleOperation: state.apply, commitLegacyGoogleBindingOperation: state.commit,
  BindingEncryptionRefused: class extends Error {}, AccountBindingStoreError: class extends Error { constructor(message: string, public code: string) { super(message); } },
}));
import { beginGoogleTenantOperation, recordAuthorizedGoogleConnection, recordAuthorizedGoogleLocationSelection, recordGoogleConnection, recordGoogleLocationSelection } from "@/lib/google-access";
const tenant = "fictional-operation", userId = "e7510000-0000-4000-8000-000000000001", bindingId = "e7510000-0000-4000-8000-000000000002", workspaceId = "e7510000-0000-4000-8000-000000000003", tenantStableId = "e7510000-0000-4000-8000-000000000004";
const actor = { userId, verifiedEmail: "owner@example.test" };
const pin: LegacyGoogleOperationPin = { tenantId: tenant, tenantStableId, workspaceId, bindingId, bindingUpdatedAt: "2026-10-09T00:00:00Z", locationDigest: "a".repeat(64), startedAt: "2026-10-09T00:00:01Z" };
const location = { accountId: "accounts/fictional", locationId: "fictional-place" };
const input = { tenantId: tenant, accessToken: "fictional-access", refreshToken: "fictional-refresh", expiresAt: "2099-01-01T00:00:00Z", scopes: ["openid"], ...location };
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1"); vi.stubEnv("STRELVA_NATIVE_GOOGLE_ONLY", "0"); vi.stubEnv("SECRETS_ENC_KEY", "fictional-operation-key"); state.durable.mockResolvedValue(true); state.snapshot.mockResolvedValue(pin); state.apply.mockResolvedValue({ status: "applied", bindingId }); state.commit.mockResolvedValue({ status: "applied", bindingId }); state.cache.mockResolvedValue("OK"); state.metadata.mockResolvedValue("recorded"); });
afterEach(() => vi.unstubAllEnvs());
describe("Google operation commit ordering", () => {
  it("qualifies stores and captures generation before the caller's provider phase", async () => { expect(await beginGoogleTenantOperation(tenant, actor)).toEqual(pin); expect(state.snapshot).toHaveBeenCalledWith(tenant, expect.any(String)); expect(state.apply).not.toHaveBeenCalled(); expect(state.cache).not.toHaveBeenCalled(); });
  it.each(["provider_connections", "provider_metadata"])("refuses interactive settings before %s qualifies", async store => { state.durable.mockImplementation(async name => name !== store); await expect(beginGoogleTenantOperation(tenant, actor)).rejects.toThrow("persistence_unavailable"); expect(state.snapshot).not.toHaveBeenCalled(); expect(state.cache).not.toHaveBeenCalled(); });
  it("keeps bindings and native admission flags intact", async () => { vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "0"); await expect(beginGoogleTenantOperation(tenant, actor)).rejects.toThrow("persistence_unavailable"); vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1"); vi.stubEnv("STRELVA_NATIVE_GOOGLE_ONLY", "1"); await expect(beginGoogleTenantOperation(tenant, actor)).rejects.toThrow("workspace lifecycle"); expect(state.snapshot).not.toHaveBeenCalled(); });
  it("does not substitute a dev bypass or missing verified identity", async () => { await expect(beginGoogleTenantOperation(tenant, { ...actor, userId: "dev-access-bypass" })).rejects.toThrow(); expect(state.snapshot).not.toHaveBeenCalled(); });
  it.each(["oauth", "location"])("commits the exact interactive %s actor and original pin without cache reconstruction", async kind => { state.apply.mockImplementation(async (currentActor, captured, actualKind, change) => { expect(currentActor).toEqual(actor); expect(captured).toBe(pin); expect(actualKind).toBe(kind); if (kind === "oauth") expect(change.grant.accessToken).toBe(input.accessToken); else expect(change.location).toEqual(location); return { status: "applied", bindingId }; }); expect(await (kind === "oauth" ? recordAuthorizedGoogleConnection(input, actor, pin) : recordAuthorizedGoogleLocationSelection(tenant, location, actor, pin))).toEqual({ binding: "written" }); expect(state.save).not.toHaveBeenCalled(); expect(state.metadata).not.toHaveBeenCalled(); expect(state.cache).not.toHaveBeenCalled(); });
  it.each(["oauth", "location"])("refused %s transaction produces no token/metadata/cache fallback", async kind => { state.apply.mockRejectedValue(new Error("fictional current-role denial")); await expect(kind === "oauth" ? recordAuthorizedGoogleConnection(input, actor, pin) : recordAuthorizedGoogleLocationSelection(tenant, location, actor, pin)).rejects.toThrow("current authority"); expect(state.cache).not.toHaveBeenCalled(); expect(state.save).not.toHaveBeenCalled(); expect(state.metadata).not.toHaveBeenCalled(); });
  it("does not recapture a pin or write after a revoked cutover prerequisite", async () => { state.durable.mockResolvedValue(false); await expect(recordAuthorizedGoogleConnection(input, actor, pin)).rejects.toThrow("persistence_unavailable"); expect(state.apply).not.toHaveBeenCalled(); expect(state.snapshot).not.toHaveBeenCalled(); });
  it("does not depend on an available cache after durable acceptance", async () => { state.cache.mockRejectedValue(new Error("fictional cache outage")); expect(await recordAuthorizedGoogleConnection(input, actor, pin)).toEqual({ binding: "written" }); expect(state.apply).toHaveBeenCalledTimes(1); expect(state.cache).not.toHaveBeenCalled(); });
  it("rejects a mismatched tenant before any persistence", async () => { await expect(recordAuthorizedGoogleConnection({ ...input, tenantId: "other" }, actor, pin)).rejects.toThrow("tenant changed"); expect(state.apply).not.toHaveBeenCalled(); expect(state.cache).not.toHaveBeenCalled(); });
  it.each(["oauth", "location"])("older qualified %s operation paused at capture cannot write after a newer commit", async kind => {
    let release!: () => void, entered!: () => void; const paused = new Promise<void>(resolve => { release = resolve; }); const reached = new Promise<void>(resolve => { entered = resolve; });
    let selected = "initial", version = 1, first = true;
    state.snapshot.mockImplementation(async () => { const captured = { ...pin, bindingUpdatedAt: String(version) }; if (first) { first = false; entered(); await paused; } return captured; });
    state.commit.mockImplementation(async (captured, change) => { if (captured.bindingUpdatedAt !== String(version)) throw new Error("fictional stale canonical generation"); selected = change.location.locationId; version += 1; return { status: "applied", bindingId }; });
    const run = (id: string) => kind === "oauth" ? recordGoogleConnection({ ...input, locationId: id }) : recordGoogleLocationSelection(tenant, { ...location, locationId: id });
    const older = run("older"); await reached; expect(await run("newer")).toEqual({ binding: "written" }); release(); expect(await older).toEqual({ binding: "failed" }); expect(selected).toBe("newer");
    expect(state.commit.mock.calls[0]![0].bindingUpdatedAt).toBe("1"); expect(state.commit.mock.calls[1]![0].bindingUpdatedAt).toBe("1");
    expect(state.cache).not.toHaveBeenCalled(); expect(state.save).not.toHaveBeenCalled(); expect(state.metadata).not.toHaveBeenCalled();
  });
});
