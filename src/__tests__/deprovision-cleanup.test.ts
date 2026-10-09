import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  redisAvailable: true, configured: true, guardFails: false, saveFails: false,
  receipt: { id: "27410000-0000-4000-8000-000000000010", tenantId: "fictional-cleanup", databaseDeleted: true,
    redisComplete: false, providerComplete: false, complete: false },
  summary: { redis: [] as Array<{ target: string }> },
  calls: [] as string[], keys: new Set<string>(),
  bookingGrants: 0, bookings: 0, malformedBlocker: false,
}));
const redis = vi.hoisted(() => ({
  exists: vi.fn(async (key: string) => state.keys.has(key) ? 1 : 0),
  scan: vi.fn(async (_cursor: string, { match }: { match: string }) => ["0", [...state.keys].filter(key => key.startsWith(match.slice(0, -1)))]),
  zrange: vi.fn(async () => []), get: vi.fn(async (_key?: string): Promise<unknown> => null),
  eval: vi.fn(async () => 0),
  del: vi.fn(async (...keys: string[]) => { let count = 0; for (const key of keys) if (state.keys.delete(key)) count++; return count; }),
}));
const domains = vi.hoisted(() => ({ clearTenantDomainClaims: vi.fn(async () => []) }));
const provider = vi.hoisted(() => ({ deleteVercelProject: vi.fn(async () => ({ ok: true })) }));
const accounts = vi.hoisted(() => ({ unlinkTenant: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => state.redisAvailable ? redis : null }));
vi.mock("@/lib/domains", () => domains);
vi.mock("@/lib/accounts", () => accounts);
vi.mock("@/lib/vercel", () => ({ isVercelConfigured: () => state.configured, ...provider }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({
  from: (table: string) => ({ select: () => ({ eq: async () => ({ count: table === "tenants" ? 1 : 0, error: null }) }) }),
  rpc: async (name: string, args: Record<string, unknown>) => {
    state.calls.push(name);
    if (name === "tenant_cleanup_teardown_blockers") return { data: [{ publications: 0, reservations: 0, booking_grants: state.malformedBlocker ? null : state.bookingGrants, bookings: state.bookings }], error: null };
    if (name === "tenant_cleanup_receipt") return { data: { ...state.receipt, summary: state.summary }, error: null };
    if (name === "deprovision_tenant_guarded") return state.guardFails
      ? { data: null, error: { message: "tenant_teardown_blocked_by_workspace_owned_records" } }
      : { data: { counts: { tenants: 1 }, paused: 2, cleanup: { ...state.receipt } }, error: null };
    if (name === "finish_tenant_deprovision_cleanup") {
      if (state.saveFails) return { data: null, error: { message: "storage unavailable" } };
      state.receipt.redisComplete ||= args.p_redis_complete === true;
      state.receipt.providerComplete ||= args.p_provider_complete === true;
      state.receipt.complete = state.receipt.redisComplete && state.receipt.providerComplete;
      state.summary = structuredClone(args.p_summary as typeof state.summary);
      return { data: { ...state.receipt, summary: state.summary }, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  },
}) }));
import { runDeprovision, findTenantRedisKeys, findTenantEventBlobKeys } from "@/lib/deprovision";
const run = () => runDeprovision({ tenantId: state.receipt.tenantId, tenant: null, dryRun: false });

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("STRELVA_LEADS_AUTHORITY", "redis"); vi.stubEnv("STRELVA_TENANT_RECEIPT_RETENTION", "0");
  state.redisAvailable = true; state.configured = true; state.guardFails = false; state.saveFails = false;
  state.calls = []; state.keys = new Set(["connections:fictional-cleanup:google", "connections:other-site:google"]);
  state.bookingGrants = 0; state.bookings = 0; state.malformedBlocker = false;
  state.summary = { redis: [] };
  Object.assign(state.receipt, { redisComplete: false, providerComplete: false, complete: false });
});
afterEach(() => vi.unstubAllEnvs());
describe("truthful committed database removal and retryable cleanup", () => {
  it("retains the native pending receipt when Redis is absent, without claiming deleted caches", async () => {
    state.redisAvailable = false;
    const result = await run();
    expect(result).toMatchObject({ ok: false, databaseDeleted: true, cleanup: { redisComplete: false, providerComplete: true, complete: false } });
    expect(result.summary.postgres).toContainEqual({ target: "tenants", found: 1, deleted: true });
    expect(result.summary.redis?.every(action => !action.deleted)).toBe(true);
    await expect(findTenantRedisKeys(["connections:fictional-cleanup:*"])).rejects.toThrow("redis_unavailable");
    await expect(findTenantEventBlobKeys("fictional-cleanup")).rejects.toThrow("redis_unavailable");
  });
  it("scan refusal is incomplete, preserves both tenants and can resume from the exact native receipt", async () => {
    redis.scan.mockRejectedValueOnce(new Error("scan refused"));
    const first = await run();
    expect(first.ok).toBe(false); expect(state.keys.size).toBe(2);
    state.calls = [];
    const retry = await runDeprovision({ tenantId: state.receipt.tenantId, tenant: null, dryRun: false, cleanupReceiptId: first.cleanup!.id });
    expect(retry.ok).toBe(true);
    expect(state.calls).not.toContain("deprovision_tenant_guarded");
    expect(provider.deleteVercelProject).toHaveBeenCalledTimes(1);
    expect([...state.keys]).toEqual(["connections:other-site:google"]);
  });
  it("failed deletion retains a pending receipt and does not report the undeleted key or caches as deleted", async () => {
    redis.del.mockRejectedValueOnce(new Error("delete refused"));
    const result = await run();
    expect(result).toMatchObject({ ok: false, cleanup: { redisComplete: false } });
    expect(result.summary.redis?.some(action => action.target === "connections:fictional-cleanup:google" && action.deleted)).toBe(false);
    expect(state.keys.has("connections:other-site:google")).toBe(true);
  });
  it("failed shared-domain cleanup preserves its failure after the guarded database deletion", async () => {
    domains.clearTenantDomainClaims.mockRejectedValueOnce(new Error("shared map write failed"));
    const result = await run();
    expect(state.calls[1]).toBe("deprovision_tenant_guarded");
    expect(result).toMatchObject({ ok: false, databaseDeleted: true, cleanup: { redisComplete: false } });
    expect(result.summary.redis?.some(action => action.target.startsWith("domain-claim") && action.deleted)).toBe(false);
  });
  it.each(["unconfigured", "refused", "retained"])("provider %s keeps teardown incomplete", async condition => {
    state.configured = condition !== "unconfigured";
    if (condition === "refused") provider.deleteVercelProject.mockResolvedValueOnce({ ok: false });
    const result = await runDeprovision({ tenantId: state.receipt.tenantId, tenant: null, dryRun: false, keepVercel: condition === "retained" });
    expect(result).toMatchObject({ ok: false, cleanup: { redisComplete: true, providerComplete: false } });
    expect(result.summary.vercel?.every(action => !action.deleted)).toBe(true);
  });
  it("a guarded SQL refusal performs no external cleanup", async () => {
    state.guardFails = true;
    await expect(run()).rejects.toThrow("blocked_by_workspace_owned_records");
    expect(redis.del).not.toHaveBeenCalled(); expect(provider.deleteVercelProject).not.toHaveBeenCalled();
  });
  it("a stale retry id and an already-completed receipt cannot touch a new site's data", async () => {
    await expect(runDeprovision({ tenantId: state.receipt.tenantId, tenant: null, dryRun: false, cleanupReceiptId: "27410000-0000-4000-8000-000000000099" })).rejects.toThrow("receipt_changed");
    state.receipt.redisComplete = true; state.receipt.providerComplete = true; state.receipt.complete = true;
    expect(await runDeprovision({ tenantId: state.receipt.tenantId, tenant: null, dryRun: false, cleanupReceiptId: state.receipt.id })).toMatchObject({ ok: true, executed: false });
    expect(redis.del).not.toHaveBeenCalled(); expect(provider.deleteVercelProject).not.toHaveBeenCalled();
  });
  it("receipt update failure never fabricates a completed purge", async () => {
    state.saveFails = true;
    await expect(run()).rejects.toThrow("receipt_unavailable_after_database_removal");
    expect(state.receipt.complete).toBe(false);
  });
  it("dry-run unavailable Redis is unknown and writes no receipt or provider state", async () => {
    state.redisAvailable = false;
    expect(await runDeprovision({ tenantId: state.receipt.tenantId, tenant: null, dryRun: true })).toMatchObject({ ok: false, executed: false });
    expect(state.calls).toEqual(["tenant_cleanup_teardown_blockers"]);
    expect(provider.deleteVercelProject).not.toHaveBeenCalled();
  });
  it.each(["bookingGrants", "bookings"] as const)("dry-run refuses an exact %s-only hold without calling the write guard", async hold => {
    state[hold] = 1;
    const result = await runDeprovision({ tenantId: state.receipt.tenantId, tenant: null, dryRun: true });
    expect(result).toMatchObject({ ok: false, executed: false, refusalReason: "workspace_website" });
    expect(state.calls).toEqual(["tenant_cleanup_teardown_blockers"]);
    expect(redis.del).not.toHaveBeenCalled(); expect(provider.deleteVercelProject).not.toHaveBeenCalled();
  });
  it("unknown booking blocker evidence cannot become an eligible zero-count preview", async () => {
    state.malformedBlocker = true;
    await expect(runDeprovision({ tenantId: state.receipt.tenantId, tenant: null, dryRun: true })).rejects.toThrow("blockers_unavailable");
    expect(redis.del).not.toHaveBeenCalled(); expect(provider.deleteVercelProject).not.toHaveBeenCalled();
  });
  it("checkpoints the account identity before unlinking so a failed write can retry after the reverse index vanished", async () => {
    const index = "account-of:fictional-cleanup";
    state.keys.add(index);
    let tenantIds = ["fictional-cleanup", "other-site"];
    redis.get.mockImplementation(async key => key === index ? state.keys.has(index) ? "shared" : null : key === "account:shared" ? { tenantIds } : null);
    accounts.unlinkTenant.mockImplementationOnce(async () => {
      expect(state.summary.redis).toContainEqual(expect.objectContaining({ target: "account:shared" }));
      state.keys.delete(index);
      throw new Error("account save failed after unlinking the reverse index");
    }).mockImplementationOnce(async () => { tenantIds = ["other-site"]; return { tenantIds }; });
    const first = await run();
    expect(first).toMatchObject({ ok: false, cleanup: { redisComplete: false } });
    state.redisAvailable = false;
    const unavailable = await runDeprovision({ tenantId: state.receipt.tenantId, tenant: null, dryRun: false, cleanupReceiptId: first.cleanup!.id });
    expect(unavailable.ok).toBe(false);
    expect(state.summary.redis).toContainEqual(expect.objectContaining({ target: "account:shared" }));
    state.redisAvailable = true;
    const retry = await runDeprovision({ tenantId: state.receipt.tenantId, tenant: null, dryRun: false, cleanupReceiptId: first.cleanup!.id });
    expect(retry.ok).toBe(true);
    expect(accounts.unlinkTenant).toHaveBeenLastCalledWith("shared", "fictional-cleanup", { readRedisForCleanup: true });
    expect(tenantIds).toEqual(["other-site"]);
  });
});
