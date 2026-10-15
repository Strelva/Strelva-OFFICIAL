import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ redis: vi.fn(), rpc: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: mocks.redis }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
import { getPayLink, listPayLinks, type PayLinkConfig } from "@/platform/infra/pay-links";

const legacyRedis: PayLinkConfig = { slug: "old-link", clientName: "Redis Client", door: "build", amountCents: 50000, createdAt: "2026-07-01T00:00:00Z" };
const row = (over: Record<string, unknown>) => ({
  id: "a2830000-0000-4000-8000-000000000012", slug: "old-link", rail: "platform_legacy", agencyWorkspaceId: "a2830000-0000-4000-8000-000000000010", businessWorkspaceId: null, clientName: "Postgres Client",
  description: "Extra copy", door: "build", amountCents: 50000, minCents: null, maxCents: null, currency: "usd", agencyDisplayName: "North Studio", createdBy: null, createdAt: "2026-07-01T00:00:00Z",
  revokedAt: null, revokedBy: null, checkoutGeneration: 0, legacyTenantId: "tenant-1", leadSlug: null, returnUrl: null, status: "open", paidAt: null, paidAmountCents: null, invoiceNumber: null, receiptNumber: null, ...over,
});
let redis: { get: ReturnType<typeof vi.fn>; smembers: ReturnType<typeof vi.fn>; mget: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.clearAllMocks();
  redis = { get: vi.fn(async () => legacyRedis), smembers: vi.fn(async () => ["old-link"]), mget: vi.fn(async () => [legacyRedis]) };
  mocks.redis.mockReturnValue(redis);
});
afterEach(() => vi.unstubAllEnvs());

describe("pay-link store switch", () => {
  it("reads Redis and never the database by default", async () => {
    expect((await getPayLink("old-link"))?.clientName).toBe("Redis Client");
    expect(await listPayLinks()).toEqual([legacyRedis]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("reads Postgres and maps fields once the store is switched", async () => {
    vi.stubEnv("STRELVA_PAY_LINK_STORE", "postgres");
    mocks.rpc.mockResolvedValue({ data: row({}), error: null });
    expect(await getPayLink("old-link")).toMatchObject({ clientName: "Postgres Client", tenantId: "tenant-1", customCopy: "Extra copy", agencyWorkspaceId: "a2830000-0000-4000-8000-000000000010" });
    expect(redis.get).not.toHaveBeenCalled();
  });
  it("does not serve a connected link or a missing one through the legacy read", async () => {
    vi.stubEnv("STRELVA_PAY_LINK_STORE", "postgres");
    mocks.rpc.mockResolvedValue({ data: row({ rail: "connected_account", door: null }), error: null });
    expect(await getPayLink("old-link")).toBeNull();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await getPayLink("old-link")).toBeNull();
  });
  it("lists only legacy-rail links from Postgres", async () => {
    vi.stubEnv("STRELVA_PAY_LINK_STORE", "postgres");
    mocks.rpc.mockResolvedValue({ data: [row({}), row({ slug: "connected", rail: "connected_account", door: null })], error: null });
    expect((await listPayLinks()).map(link => link.slug)).toEqual(["old-link"]);
    expect(redis.smembers).not.toHaveBeenCalled();
  });
});
