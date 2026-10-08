import { afterEach, describe, expect, it, vi } from "vitest";
import { LEAD_RETENTION_TIMEOUT_MS, purgeExpiredTenantLeads, setLeadMirrorDb } from "@/lib/lead-mirror";

// The retention purge for lead copies of deprovisioned clients. The SQL rule
// (365 days, attached leads kept, one receipt per tenant) is proven in
// tests/business-ownership-schema.sql; this is the never-throwing caller.

afterEach(() => { setLeadMirrorDb(undefined); vi.useRealTimers(); });

describe("purgeExpiredTenantLeads", () => {
  it("calls the purge with its bound and reports the counts", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { purged: 3, tenants: 1 }, error: null });
    setLeadMirrorDb({ rpc });
    await expect(purgeExpiredTenantLeads(500)).resolves.toEqual({ status: "purged", purged: 3, tenants: 1 });
    expect(rpc).toHaveBeenCalledWith("purge_expired_tenant_leads", { p_limit: 500 });
  });

  it("reports the additive minimized orphan count while older schemas remain compatible", async () => {
    setLeadMirrorDb({ rpc: vi.fn().mockResolvedValue({ data: { purged: 1, tenants: 1, minimized: 2 }, error: null }) });
    await expect(purgeExpiredTenantLeads()).resolves.toEqual({ status: "purged", purged: 1, tenants: 1, minimized: 2 });
  });

  it("bounds invalid limits and refuses impossible receipt counts", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { purged: 0, tenants: 0 }, error: null });
    setLeadMirrorDb({ rpc });
    await purgeExpiredTenantLeads(Infinity);
    expect(rpc).toHaveBeenLastCalledWith("purge_expired_tenant_leads", { p_limit: 1000 });
    await purgeExpiredTenantLeads(100_000);
    expect(rpc).toHaveBeenLastCalledWith("purge_expired_tenant_leads", { p_limit: 10_000 });
    await purgeExpiredTenantLeads(-1);
    expect(rpc).toHaveBeenLastCalledWith("purge_expired_tenant_leads", { p_limit: 1 });
    for (const data of [{ purged: -1, tenants: 0 }, { purged: 1, tenants: 2 }, { purged: 501, tenants: 1 }, { purged: 1.5, tenants: 1 }, { purged: null, tenants: null }, { purged: "0", tenants: "0" }, { purged: 1, tenants: 1, minimized: -1 }, { purged: 1, tenants: 1, minimized: 500 }]) {
      rpc.mockResolvedValue({ data, error: null });
      await expect(purgeExpiredTenantLeads(500)).resolves.toEqual({ status: "unavailable", reason: "malformed_response" });
    }
  });

  it("aborts a stalled purge and releases the cron without claiming a receipt", async () => {
    vi.useFakeTimers();
    const stalled = new Promise<never>(() => {});
    let signal: AbortSignal | undefined;
    const call = Object.assign(stalled, { abortSignal: vi.fn((received: AbortSignal) => { signal = received; return stalled; }) });
    setLeadMirrorDb({ rpc: vi.fn(() => call) });
    const pending = purgeExpiredTenantLeads();
    await vi.advanceTimersByTimeAsync(LEAD_RETENTION_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ status: "unavailable", reason: "timeout" });
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports unavailable instead of throwing when the database or function is missing", async () => {
    setLeadMirrorDb(null);
    await expect(purgeExpiredTenantLeads()).resolves.toEqual({ status: "unavailable", reason: "unconfigured" });
    setLeadMirrorDb({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "function public.purge_expired_tenant_leads does not exist" } }) });
    await expect(purgeExpiredTenantLeads()).resolves.toMatchObject({ status: "unavailable" });
    setLeadMirrorDb({ rpc: vi.fn().mockRejectedValue(new Error("socket hang up")) });
    await expect(purgeExpiredTenantLeads()).resolves.toEqual({ status: "unavailable", reason: "socket hang up" });
    setLeadMirrorDb({ rpc: vi.fn().mockResolvedValue({ data: { purged: "x" }, error: null }) });
    await expect(purgeExpiredTenantLeads()).resolves.toEqual({ status: "unavailable", reason: "malformed_response" });
  });
});
