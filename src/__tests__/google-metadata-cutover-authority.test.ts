import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleGrant } from "@/lib/google-access";
import type { ClientRecord, ClientRecordDb } from "@/platform/client-records/mirror";
const mocks = vi.hoisted(() => ({ redis: null as null | { set: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> } }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => mocks.redis ? { ...mocks.redis, hincrby: vi.fn(), expire: vi.fn() } : null }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => null }));
import { setClientRecordDb } from "@/platform/client-records/mirror";
import { setAccountBindingsDb } from "@/platform/account-bindings/store";
import { recordGoogleConnection, recordGoogleLocationSelection, getGoogleLocation } from "@/lib/google-access";
import { getConnection } from "@/lib/connections";
const tenant = "fictional-google-metadata";
const rows = new Map<string, ClientRecord>();
let failure: string | null = null;
let writeStatus = "recorded";
let qualificationDays = 7;
let qualificationObserver: (() => void) | null = null;
const calls: string[] = [];
const db: ClientRecordDb = { async rpc(name, args) {
  calls.push(name);
  if (name === failure) return { data: null, error: { message: "fictional outage" } };
  if (name === "client_record_parity_streak") { qualificationObserver?.(); return { data: { days: qualificationDays }, error: null }; }
  if (name === "record_tenant_client_record") {
    if (args.p_store === "provider_metadata" && writeStatus !== "recorded") return { data: { status: writeStatus }, error: null };
    rows.set(`${args.p_store}|${args.p_record_id}`, { recordId: String(args.p_record_id), payload: args.p_payload as Record<string, unknown>, capturedAt: String(args.p_captured_at) });
    return { data: { status: "recorded" }, error: null };
  }
  if (name === "read_tenant_client_records_page") return { data: [...rows].filter(([key]) => key.startsWith(`${args.p_store}|`)).map(([, row]) => row), error: null };
  return { data: null, error: { message: `Unexpected RPC ${name}` } };
} };
// Finite RPC infrastructure models accepted/rejected writes. The producer and
// selected client-record reader are real; SQL atomicity remains untested here.
const bindingDb = { async rpc(name: string, args: Record<string, unknown>) {
  calls.push(name);
  if (name === "read_google_binding_for_tenant") return { data: null, error: null };
  if (name === "read_legacy_google_operation") return { data: { tenantId: tenant, tenantStableId: "e7520000-0000-4000-8000-000000000011", workspaceId: null, bindingId: null, bindingUpdatedAt: null, locationDigest: null }, error: null };
  if (name !== "commit_legacy_google_binding_operation") throw new Error(`Unexpected binding RPC ${name}`);
  if (failure === "record_tenant_client_record" || writeStatus !== "recorded") return { data: null, error: { message: writeStatus === "kept" ? "legacy_google_operation_superseded" : "fictional transaction refusal" } };
  const input = args.p_input as { grant?: { accessTokenCiphertext: string; refreshTokenCiphertext: string; tokenExpiresAt: string }; location?: { accountId: string; locationId: string } };
  const pin = args.p_pin as { startedAt: string };
  if (input.grant) rows.set("provider_connections|google", { recordId: "google", payload: { provider: "google", tenantId: tenant, accessToken: input.grant.accessTokenCiphertext, refreshToken: input.grant.refreshTokenCiphertext, expiresAt: input.grant.tokenExpiresAt, status: "connected" }, capturedAt: pin.startedAt });
  if (input.location) rows.set("provider_metadata|google", { recordId: "google", payload: { value: { accountId: input.location.accountId, locationId: input.location.locationId } }, capturedAt: pin.startedAt });
  return { data: { status: "applied", bindingId: null }, error: null };
} };
beforeEach(() => {
  rows.clear(); calls.length = 0; qualificationDays = 7; qualificationObserver = null; failure = null; writeStatus = "recorded"; mocks.redis = null; setClientRecordDb(db); setAccountBindingsDb(bindingDb);
  vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "1"); vi.stubEnv("DUAL_WRITE_PG", "1");
  vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", "provider_connections,provider_metadata");
  vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "1"); vi.stubEnv("STRELVA_NATIVE_GOOGLE_ONLY", "0");
  vi.stubEnv("SECRETS_ENC_KEY", "fictional-metadata-test-key");
});
afterEach(() => { vi.useRealTimers(); setClientRecordDb(undefined); setAccountBindingsDb(undefined); vi.unstubAllEnvs(); });
const location = { accountId: "accounts/fictional", locationId: "fictional-place" };
describe("Google metadata durable cutover", () => {
  it("records reconnect metadata and reads the same location with Redis absent", async () => {
    expect(await recordGoogleConnection({ tenantId: tenant, accessToken: "fictional-access", refreshToken: "fictional-refresh", expiresAt: "2099-01-01T00:00:00Z", ...location })).toEqual({ binding: "unlinked" });
    const grant = await getConnection(tenant, "google");
    expect(grant?.accessToken).toBe("fictional-access");
    expect(rows.get("provider_metadata|google")?.payload).toEqual({ value: location });
    expect(await getGoogleLocation(tenant)).toEqual(location);
  });
  it("records owner location selection durably with Redis absent", async () => {
    expect(await recordGoogleLocationSelection(tenant, location)).toEqual({ binding: "unlinked" });
    expect(await getGoogleLocation(tenant)).toEqual(location);
  });
  it("does not acknowledge a failed authoritative metadata write", async () => {
    failure = "record_tenant_client_record";
    expect(await recordGoogleLocationSelection(tenant, location)).toEqual({ binding: "failed" });
    expect(rows.size).toBe(0);
  });
  it("keeps durable selection visible without relying on optional Redis writes", async () => {
    mocks.redis = { set: vi.fn(async () => { throw new Error("fictional Redis outage"); }), get: vi.fn() };
    expect(await recordGoogleLocationSelection(tenant, location)).toEqual({ binding: "unlinked" });
    expect(await getGoogleLocation(tenant)).toEqual(location);
    expect(mocks.redis.get).not.toHaveBeenCalled();
    expect(mocks.redis.set).not.toHaveBeenCalled();
  });
  it("rejects a superseded metadata write before updating the Redis cache", async () => {
    writeStatus = "kept";
    mocks.redis = { set: vi.fn(), get: vi.fn() };
    expect(await recordGoogleLocationSelection(tenant, location)).toEqual({ binding: "failed" });
    expect(mocks.redis.set).not.toHaveBeenCalled();
  });
  it.each(["failed", "skipped"])("never acknowledges durable %s", async status => {
    writeStatus = status;
    expect(await recordGoogleLocationSelection(tenant, location)).toEqual({ binding: "failed" });
  });
  it("preserves the Redis-first failure contract before durable selection", async () => {
    vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", ""); vi.stubEnv("STRELVA_GOOGLE_BINDINGS", "0");
    mocks.redis = { set: vi.fn(async () => { throw new Error("fictional Redis outage"); }), get: vi.fn() };
    await expect(recordGoogleLocationSelection(tenant, location)).rejects.toThrow("fictional Redis outage");
    expect(calls).not.toContain("record_tenant_client_record");
  });
  it("keeps selected durable qualification failures explicit", async () => {
    failure = "client_record_parity_streak";
    mocks.redis = { set: vi.fn(), get: vi.fn() };
    await expect(recordGoogleLocationSelection(tenant, location)).rejects.toThrow();
    expect(mocks.redis.set).not.toHaveBeenCalled();
  });
  it("refuses a selected store without its required qualification streak", async () => {
    qualificationDays = 0;
    await expect(recordGoogleLocationSelection(tenant, location)).rejects.toThrow("client_records_cutover_not_qualified");
    expect(calls).not.toContain("record_tenant_client_record");
  });
  it("captures selection time before asynchronous authority checks", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T10:00:00Z"));
    qualificationObserver = () => vi.setSystemTime(new Date("2026-10-09T10:01:00Z"));
    await recordGoogleLocationSelection(tenant, location);
    expect(rows.get("provider_metadata|google")?.capturedAt).toBe("2026-10-09T10:00:00.000Z");
  });
  it("refuses legacy location mutation in native-only admission", async () => {
    vi.stubEnv("STRELVA_NATIVE_GOOGLE_ONLY", "1");
    await expect(recordGoogleLocationSelection(tenant, location)).rejects.toThrow("native-only");
    expect(calls).toHaveLength(0);
  });
  it("keeps native workspace selection and reconnect out of tenant metadata stores", async () => {
    const scope = "workspace-79009000-0000-4000-8000-000000000010";
    await expect(recordGoogleLocationSelection(scope, location)).rejects.toThrow("workspace binding lifecycle");
    await expect(recordGoogleConnection({ tenantId: scope, accessToken: "fictional", expiresAt: "2099-01-01T00:00:00Z", ...location })).rejects.toThrow("workspace binding lifecycle");
    expect(calls).toHaveLength(0);
  });
  it("reads native locations only from the matching canonical binding grant", async () => {
    const workspaceId = "79009000-0000-4000-8000-000000000010";
    const scope = `workspace-${workspaceId}`;
    const grant: GoogleGrant = { source: "binding", tenantId: scope, workspaceId, bindingId: "79009000-0000-4000-8000-000000000020", status: "connected", scopes: ["https://www.googleapis.com/auth/business.manage"], accessToken: "fictional", refreshToken: "fictional", expiresAt: null, location, connection: null };
    expect(await getGoogleLocation(scope, grant)).toEqual(location);
    for (const candidate of [null, { ...grant, location: null }, { ...grant, source: "redis" as const }, { ...grant, tenantId: tenant }, { ...grant, workspaceId: "79009000-0000-4000-8000-000000000099" }, { ...grant, bindingId: null }]) {
      expect(await getGoogleLocation(scope, candidate)).toBeNull();
    }
    expect(calls).toHaveLength(0);
  });

});
