import { beforeEach, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ available: true }));
const redis = vi.hoisted(() => ({ get: vi.fn(), eval: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => holder.available ? redis : null }));
vi.mock("@/lib/tenants", () => ({ invalidateDomainMapCache: vi.fn() }));
import { clearTenantDomainClaims } from "@/lib/domains";
beforeEach(() => { vi.resetAllMocks(); holder.available = true; });
describe("destructive shared-domain cleanup has no display fallback", () => {
  it("does not turn unavailable Redis or failed reads into an empty claim list", async () => {
    holder.available = false;
    await expect(clearTenantDomainClaims({ id: "fictional-cleanup" })).rejects.toThrow("unavailable");
    holder.available = true; redis.get.mockRejectedValueOnce(new Error("read failed"));
    await expect(clearTenantDomainClaims({ id: "fictional-cleanup" }, false)).rejects.toThrow("read failed");
  });
  it("dry-run discovery uses actual map ownership even when a stale config names another site's domain", async () => {
    redis.get.mockResolvedValueOnce({ "owned.example.test": { tenantId: "fictional-cleanup" }, "other.example.test": { tenantId: "other-site" } });
    expect(await clearTenantDomainClaims({ id: "fictional-cleanup" }, false)).toEqual(["owned.example.test"]);
    expect(redis.eval).not.toHaveBeenCalled();
  });
  it("the atomic ownership-checked write failure propagates rather than claiming success", async () => {
    redis.eval.mockRejectedValueOnce(new Error("map write refused"));
    await expect(clearTenantDomainClaims({ id: "fictional-cleanup" })).rejects.toThrow("map write refused");
    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining("claim.tenantId == ARGV[1]"), ["reb:domain-claims"], ["fictional-cleanup"]);
  });
  it("an unconfirmed atomic result cannot claim complete cleanup", async () => {
    redis.eval.mockResolvedValueOnce(null);
    await expect(clearTenantDomainClaims({ id: "fictional-cleanup" })).rejects.toThrow("unconfirmed");
  });
});
