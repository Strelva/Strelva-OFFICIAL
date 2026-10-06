import { afterEach, describe, expect, it, vi } from "vitest";
import { purgeExpiredTenantLeads, setLeadMirrorDb } from "@/lib/lead-mirror";

// The retention purge for lead copies of deprovisioned clients. The SQL rule
// (365 days, attached leads kept, one receipt per tenant) is proven in
// tests/business-ownership-schema.sql; this is the never-throwing caller.

afterEach(() => setLeadMirrorDb(undefined));

describe("purgeExpiredTenantLeads", () => {
  it("calls the purge with its bound and reports the counts", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { purged: 3, tenants: 1 }, error: null });
    setLeadMirrorDb({ rpc });
    await expect(purgeExpiredTenantLeads(500)).resolves.toEqual({ status: "purged", purged: 3, tenants: 1 });
    expect(rpc).toHaveBeenCalledWith("purge_expired_tenant_leads", { p_limit: 500 });
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
