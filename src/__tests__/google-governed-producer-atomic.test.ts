import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  qualified: { provider_connections: true, provider_metadata: true },
  credential: { accessToken: "fictional-current", status: "connected" } as Record<string, unknown>,
  metadata: { accountId: "accounts/fictional", locationId: "current" },
  cache: {} as Record<string, unknown>,
  generation: "2026-10-09T00:00:00.000Z", linked: true, refuse: false, beginAvailable: true,
  writes: vi.fn(), mirror: vi.fn(), cacheWrite: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/lib/client-records", () => ({
  durableRecordAuthority: async (store: keyof typeof state.qualified) => state.qualified[store],
  writeDurableRecord: state.writes, mirrorRecord: state.mirror,
  readRecord: async () => state.credential, readRecords: async () => [],
  readProviderMetadata: async () => state.metadata,
  mutateDurableConnection: vi.fn(), removeRecord: vi.fn(), removeDurableRecord: vi.fn(),
}));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => ({ set: state.cacheWrite }) }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => { throw new Error("Real database forbidden in producer test"); } }));
vi.mock("@/platform/infra/email/send", () => ({ sendEmailWithReceipt: () => { throw new Error("Real delivery forbidden"); } }));
vi.mock("@/platform/infra/tenant-publishing", async () => {
  const producer = await import("@/lib/google-access");
  return { tenantPublishingPorts: async () => ({ recordGoogleConnection: producer.recordGoogleConnection, ...(state.beginAvailable ? { beginGoogleReconnectOperation: producer.beginGoogleReconnectOperation } : {}) }) };
});

// Both google-access and connections are the real producers. Only infrastructure
// is finite in-memory state; no database/provider transaction is being proved.
import { beginGoogleReconnectOperation, recordGoogleConnection, recordGoogleLocationSelection } from "@/lib/google-access";
import * as connections from "@/lib/connections";
import { setAccountBindingsDb } from "@/platform/account-bindings/store";
import { decryptSecret } from "@/platform/infra/crypto/secrets";
import { finishGoogleReconnect, type ReconnectTarget } from "@/products/publishing/reconnect";

const tenantId = "fictional-producer";
const tenantStableId = "e7520000-0000-4000-8000-000000000001";
const workspaceId = "e7520000-0000-4000-8000-000000000002";
const bindingId = "e7520000-0000-4000-8000-000000000003";
const scope = "https://www.googleapis.com/auth/business.manage";
const input = { tenantId, accessToken: "fictional-new", refreshToken: "fictional-refresh", expiresAt: "2099-01-01T00:00:00.000Z", scopes: [scope], accountId: "accounts/fictional", locationId: "new" };
const target: ReconnectTarget = { id: "e7520000-0000-4000-8000-000000000004", tenantId, tenantStableId, workspaceId, bindingId, recipient: "owner@example.test", openedAt: "2026-10-09T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", noticeStatus: "accepted" };
const at = (seconds: number) => Date.parse(`2026-10-09T00:00:0${seconds}.000Z`);

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(at(1));
  vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1"); vi.stubEnv("STRELVA_NATIVE_GOOGLE_ONLY", "0");
  vi.stubEnv("SECRETS_ENC_KEY", "fictional-producer-key"); vi.stubEnv("GOOGLE_CLIENT_ID", "fictional-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fictional-secret"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fictional.example.test");
  vi.stubGlobal("fetch", () => { throw new Error("Real provider forbidden"); });
  state.qualified = { provider_connections: true, provider_metadata: true };
  state.credential = { accessToken: "fictional-current", status: "connected" };
  state.metadata = { accountId: "accounts/fictional", locationId: "current" };
  state.cache = { credential: "fictional-current", locationId: "current" };
  state.generation = "2026-10-09T00:00:00.000Z"; state.linked = true; state.refuse = false; state.beginAvailable = true;
  state.writes.mockImplementation(async (store, _tenant, _id, payload) => {
    if (store === "provider_connections") state.credential = payload;
    else state.metadata = payload.value;
    return "updated";
  });
  state.cacheWrite.mockImplementation(async (key, value) => { state.cache[key] = value; return "OK"; });
  state.rpc.mockImplementation(async (name, args) => {
    if (name === "read_legacy_google_operation") return { data: { tenantId, tenantStableId,
      workspaceId: state.linked ? workspaceId : null, bindingId: state.linked ? bindingId : null,
      bindingUpdatedAt: state.linked ? state.generation : null, locationDigest: state.linked ? "a".repeat(64) : null }, error: null };
    if (name !== "commit_legacy_google_binding_operation") throw new Error(`Unexpected infrastructure call: ${name}`);
    if (state.refuse || Date.parse(args.p_pin.startedAt) <= Date.parse(state.generation)
      || state.linked && args.p_pin.bindingUpdatedAt !== state.generation) {
      return { data: null, error: { message: "legacy_google_operation_superseded" } };
    }
    const change = args.p_input;
    if (change.grant) state.credential = { accessToken: change.grant.accessTokenCiphertext, refreshToken: change.grant.refreshTokenCiphertext, status: "connected" };
    if (change.location) state.metadata = { accountId: change.location.accountId, locationId: change.location.locationId };
    state.generation = new Date().toISOString();
    return { data: { status: "applied", bindingId: state.linked ? bindingId : null }, error: null };
  });
  setAccountBindingsDb({ rpc: async (name, args) => state.rpc(name, args) });
});
afterEach(() => { setAccountBindingsDb(undefined); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function assertNoIndependentWrites() {
  expect(state.writes).not.toHaveBeenCalled(); expect(state.mirror).not.toHaveBeenCalled(); expect(state.cacheWrite).not.toHaveBeenCalled();
}

describe("actual governed Google producers", () => {
  it("refuses a token response begun before a newer completed grant, preserving every store", async () => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { release = resolve; });
    const fetcher = vi.fn<typeof fetch>(() => pending);
    const older = finishGoogleReconnect(target, "fictional-code", fetcher);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(state.rpc.mock.calls.map(([name]) => name)).toEqual(["read_legacy_google_operation"]);
    vi.setSystemTime(at(2)); state.generation = new Date().toISOString();
    state.credential = { accessToken: "fictional-newer", status: "connected" };
    state.metadata = { accountId: "accounts/fictional", locationId: "newer" };
    state.cache = { credential: "fictional-newer", locationId: "newer" };
    const before = structuredClone({ credential: state.credential, metadata: state.metadata, cache: state.cache });
    vi.setSystemTime(at(3)); release(new Response(JSON.stringify({ access_token: "fictional-older", refresh_token: "fictional-older-refresh", expires_in: 3600, scope })));
    await expect(older).rejects.toThrow("could not be saved");
    expect(state.rpc.mock.calls.map(([name]) => name)).toEqual(["read_legacy_google_operation", "commit_legacy_google_binding_operation"]);
    expect(state.rpc.mock.calls.find(([name]) => name === "commit_legacy_google_binding_operation")?.[1].p_pin.startedAt).toBe(new Date(at(1)).toISOString());
    expect({ credential: state.credential, metadata: state.metadata, cache: state.cache }).toEqual(before);
    assertNoIndependentWrites();
  });
  it("uses one encrypted trusted transaction with the original start and exact location", async () => {
    vi.setSystemTime(at(3));
    expect(await recordGoogleConnection(input, at(1))).toEqual({ binding: "written" });
    expect(state.rpc.mock.calls.map(([name]) => name)).toEqual(["read_legacy_google_operation", "commit_legacy_google_binding_operation"]);
    const args = state.rpc.mock.calls[1]![1];
    expect(args.p_pin.startedAt).toBe(new Date(at(1)).toISOString());
    expect(args.p_input.location).toEqual({ accountId: input.accountId, locationId: input.locationId, title: null });
    expect(args.p_input.grant.accessTokenCiphertext).toMatch(/^enc:v1:/);
    expect(decryptSecret(state.credential.accessToken as string)).toBe(input.accessToken);
    expect(state.metadata.locationId).toBe("new"); assertNoIndependentWrites();
  });
  it("refuses an original start older than the newly captured grant even when its pin matches", async () => {
    vi.setSystemTime(at(3)); state.generation = new Date(at(2)).toISOString();
    const before = structuredClone({ credential: state.credential, metadata: state.metadata, cache: state.cache });
    expect(await recordGoogleConnection(input, at(1))).toEqual({ binding: "failed" });
    const args = state.rpc.mock.calls[1]![1];
    expect(args.p_pin.bindingUpdatedAt).toBe(state.generation);
    expect(args.p_pin.startedAt).toBe(new Date(at(1)).toISOString());
    expect({ credential: state.credential, metadata: state.metadata, cache: state.cache }).toEqual(before);
    assertNoIndependentWrites();
  });
  it("refuses unavailable qualified persistence before the actual token exchange", async () => {
    state.qualified.provider_metadata = false; const fetcher = vi.fn<typeof fetch>();
    await expect(finishGoogleReconnect(target, "fictional-code", fetcher)).rejects.toThrow("persistence");
    expect(fetcher).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled(); assertNoIndependentWrites();
  });
  it("refuses a missing begin port before provider exchange instead of falling back", async () => {
    state.beginAvailable = false; const fetcher = vi.fn<typeof fetch>();
    await expect(finishGoogleReconnect(target, "fictional-code", fetcher)).rejects.toThrow("persistence");
    expect(fetcher).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled(); assertNoIndependentWrites();
  });
  it.each(["tenantId", "startedAt"] as const)("rejects a foreign original pin %s without recapture or persistence", async key => {
    const pin = await beginGoogleReconnectOperation(tenantId, at(1)); state.rpc.mockClear();
    const changed = { ...pin, [key]: key === "tenantId" ? "foreign-tenant" : new Date(at(2)).toISOString() };
    expect(await recordGoogleConnection(input, at(1), changed)).toEqual({ binding: "failed" });
    expect(state.rpc).not.toHaveBeenCalled(); assertNoIndependentWrites();
  });
  it.each(["workspaceId", "bindingId", "tenantStableId"] as const)("refuses a changed target %s before the actual token exchange", async key => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(finishGoogleReconnect({ ...target, [key]: "e7520000-0000-4000-8000-000000000009" }, "fictional-code", fetcher)).rejects.toThrow("target changed");
    expect(fetcher).not.toHaveBeenCalled(); expect(state.rpc).toHaveBeenCalledTimes(1); assertNoIndependentWrites();
  });
  it("does not call the actual legacy saveConnection when transaction admission fails", async () => {
    const save = vi.spyOn(connections, "saveConnection"); state.refuse = true;
    expect(await recordGoogleConnection(input, at(1))).toEqual({ binding: "failed" });
    expect(save).not.toHaveBeenCalled(); expect(state.credential.accessToken).toBe("fictional-current");
    expect(state.metadata.locationId).toBe("current"); assertNoIndependentWrites();
  });
  it("commits unlinked qualified credentials and metadata through the same transaction", async () => {
    state.linked = false;
    expect(await recordGoogleConnection(input, at(1))).toEqual({ binding: "unlinked" });
    expect(state.rpc.mock.calls[1]![1].p_input.grant.workspaceId).toBe("");
    expect(decryptSecret(state.credential.accessToken as string)).toBe(input.accessToken); assertNoIndependentWrites();
  });
  it.each(["provider_connections", "provider_metadata"] as const)("fails closed when %s is not qualified", async store => {
    state.qualified[store] = false;
    expect(await recordGoogleConnection(input, at(1))).toEqual({ binding: "failed" });
    expect(state.rpc).not.toHaveBeenCalled(); assertNoIndependentWrites();
  });
  it("fails closed if qualified records have no binding transaction port", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "0");
    expect(await recordGoogleConnection(input, at(1))).toEqual({ binding: "failed" });
    expect(state.rpc).not.toHaveBeenCalled(); assertNoIndependentWrites();
  });
  it("keeps location metadata unchanged when its qualified transaction refuses", async () => {
    state.refuse = true;
    expect(await recordGoogleLocationSelection(tenantId, { accountId: input.accountId, locationId: "refused" })).toEqual({ binding: "failed" });
    expect(state.metadata.locationId).toBe("current"); assertNoIndependentWrites();
  });
  it("retains the actual Redis producer only when bindings and both durable stores are off", async () => {
    vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "0"); state.qualified = { provider_connections: false, provider_metadata: false };
    expect(await recordGoogleConnection(input, at(1))).toEqual({ binding: "disabled" });
    expect(state.rpc).not.toHaveBeenCalled(); expect(state.cacheWrite).toHaveBeenCalledTimes(2);
    expect(state.mirror).toHaveBeenCalledTimes(2); expect(state.writes).not.toHaveBeenCalled();
  });
});
