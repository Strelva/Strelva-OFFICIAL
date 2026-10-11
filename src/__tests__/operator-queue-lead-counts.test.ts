import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: vi.fn(), redis: vi.fn(), range: vi.fn(), zrange: vi.fn(), eq: vi.fn(), gte: vi.fn(), select: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: mocks.db }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: mocks.redis }));
import { readQueueLeadCounts } from "@/platform/operator-queue/lead-counts";
const NOW = Date.parse("2026-10-07T12:00:00Z");
const tenants = [{ id: "alpha", stableId: "stable-alpha", siteName: "Alpha" }, { id: "beta", stableId: "stable-beta", siteName: "Beta" }];
const links = tenants.map(tenant => ({ tenantId: tenant.id, tenantStableId: tenant.stableId, workspaceId: "workspace", workspaceName: "One business", systemId: null }));
beforeEach(() => {
  vi.resetAllMocks();
  const query = { select: mocks.select.mockReturnThis(), eq: mocks.eq.mockReturnThis(), gte: mocks.gte.mockReturnThis(), lte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: mocks.range };
  mocks.db.mockReturnValue({ from: vi.fn(() => query) }); mocks.redis.mockReturnValue({ zrange: mocks.zrange });
  mocks.zrange.mockResolvedValue(["shared", "redis-only"]); mocks.range.mockResolvedValue({ data: [{ lead_id: "shared" }, { lead_id: "pg-only" }], error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("operator business lead counts", () => {
  it("deduplicates each site across stores and combines both sites of a business", async () => {
    expect(await readQueueLeadCounts(tenants, links, NOW)).toEqual([{ businessKey: "w:workspace", businessName: "One business", lastSevenDays: 6, failure: null }]);
    expect(mocks.select).toHaveBeenCalledWith("lead_id"); expect(mocks.eq).toHaveBeenCalledWith("tenant_stable_id", "stable-alpha");
    expect(mocks.gte).toHaveBeenCalledWith("captured_at", "2026-09-30T12:00:00.000Z");
    expect(mocks.zrange).toHaveBeenCalledWith("leads:alpha", NOW - 7 * 86_400_000, NOW, { byScore: true });
  });
  it("reads beyond 500 rows and retains unconverted client identity", async () => {
    mocks.zrange.mockResolvedValue([]); mocks.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, index) => ({ lead_id: `pg-${index}` })), error: null })
      .mockResolvedValueOnce({ data: [{ lead_id: "last" }], error: null });
    expect(await readQueueLeadCounts([tenants[0]!], [], NOW)).toMatchObject([{ businessKey: "t:alpha", lastSevenDays: 501 }]);
    expect(mocks.range).toHaveBeenNthCalledWith(2, 500, 999);
  });
  it("reports an unknown whole-business count when either store or a second site fails", async () => {
    mocks.range.mockResolvedValueOnce({ data: [{ lead_id: "first" }], error: null }).mockResolvedValueOnce({ data: null, error: { message: "failed" } });
    expect(await readQueueLeadCounts(tenants, links, NOW)).toMatchObject([{ lastSevenDays: null, failure: expect.stringContaining("could not be read") }]);
    mocks.redis.mockReturnValue(null); expect(await readQueueLeadCounts([tenants[0]!], [], NOW)).toMatchObject([{ lastSevenDays: null }]);
  });
});
