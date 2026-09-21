import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAllTenants: vi.fn(),
  listAllDomainClaims: vi.fn(async () => []),
  redisReadFails: false,
  redisValues: new Map<string, unknown>(),
  redisSet: vi.fn(),
}));

const redis = {
  async get<T>(key: string): Promise<T | null> {
    if (mocks.redisReadFails) throw new Error("redis unavailable");
    return (mocks.redisValues.get(key) as T | undefined) ?? null;
  },
  async set(key: string, value: unknown): Promise<string> {
    mocks.redisSet(key, value);
    mocks.redisValues.set(key, value);
    return "OK";
  },
  async del(key: string): Promise<number> {
    return mocks.redisValues.delete(key) ? 1 : 0;
  },
};

vi.mock("@/lib/redis", () => ({ getRedis: () => redis }));
vi.mock("@/lib/crypto/secrets", () => ({
  decryptSecret: (value: string | undefined) => value,
  encryptSecret: (value: string | undefined) => value,
}));
vi.mock("@/lib/auth", () => ({ assignUserToTenant: vi.fn(), findUserIdByEmail: vi.fn() }));
vi.mock("@/lib/production-guard", () => ({ isProductionEnv: () => false }));
vi.mock("@/lib/tenant-domain-map", () => ({ buildTenantDomainMap: vi.fn(() => ({})) }));
vi.mock("@/lib/db/source-flags", () => ({ tenantsSourceIsPostgres: () => true }));
vi.mock("@/lib/db/repositories", () => ({
  listAllTenants: (...args: unknown[]) => mocks.listAllTenants(...args),
  getTenant: vi.fn(),
  upsertTenant: vi.fn(),
}));
vi.mock("@/lib/db/domain-claims", () => ({
  domainClaimToRow: vi.fn(),
  listAllDomainClaims: () => mocks.listAllDomainClaims(),
  listDomainClaims: vi.fn(async () => []),
  replaceDomainClaims: vi.fn(),
  rowToDomainClaim: vi.fn(),
}));

function tenantRow(id: string) {
  return {
    id,
    stable_id: `stable-${id}`,
    site_name: `Site ${id}`,
    owner_name: "Owner",
    owner_email: `owner-${id}@example.test`,
    industry: "services",
    active: true,
    created_at: "2026-09-18",
    updated_at: "2026-09-18T12:00:00.000Z",
    template: "wellness",
  };
}

async function tenantsModule() {
  return import("@/lib/tenants");
}

describe("tenant list cache invalidation", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.listAllTenants.mockReset();
    mocks.listAllDomainClaims.mockClear();
    mocks.redisSet.mockClear();
    mocks.redisReadFails = false;
    mocks.redisValues.clear();
  });

  it("reloads Postgres after another process explicitly removes the Redis cache key", async () => {
    mocks.listAllTenants.mockResolvedValueOnce([tenantRow("first")]);
    const tenants = await tenantsModule();
    expect((await tenants.getAllTenants()).map((tenant) => tenant.id)).toEqual(["first"]);

    mocks.redisValues.delete("reb:tenants:all");
    mocks.listAllTenants.mockResolvedValueOnce([tenantRow("first"), tenantRow("new")]);

    expect((await tenants.getAllTenants()).map((tenant) => tenant.id)).toEqual(["first", "new"]);
    expect(mocks.listAllTenants).toHaveBeenCalledTimes(2);
  });

  it("uses the bounded process-local copy when Redis itself fails", async () => {
    mocks.listAllTenants.mockResolvedValueOnce([tenantRow("known")]);
    const tenants = await tenantsModule();
    expect((await tenants.getAllTenants()).map((tenant) => tenant.id)).toEqual(["known"]);

    mocks.redisReadFails = true;
    mocks.listAllTenants.mockResolvedValueOnce([tenantRow("unread")]);

    expect((await tenants.getAllTenants()).map((tenant) => tenant.id)).toEqual(["known"]);
    expect(mocks.listAllTenants).toHaveBeenCalledTimes(1);
  });

  it("does not put an empty Postgres result into the shared or process-local cache", async () => {
    mocks.listAllTenants.mockResolvedValueOnce([tenantRow("known")]);
    const tenants = await tenantsModule();
    await tenants.getAllTenants();
    expect(mocks.redisSet).toHaveBeenCalledTimes(1);

    mocks.redisValues.delete("reb:tenants:all");
    mocks.listAllTenants.mockResolvedValueOnce([]);
    expect(await tenants.getAllTenants()).toEqual([]);
    expect(mocks.redisSet).toHaveBeenCalledTimes(1);

    mocks.listAllTenants.mockResolvedValueOnce([tenantRow("recovered")]);
    expect((await tenants.getAllTenants()).map((tenant) => tenant.id)).toEqual(["recovered"]);
    expect(mocks.listAllTenants).toHaveBeenCalledTimes(3);
    expect(mocks.redisSet).toHaveBeenCalledTimes(2);
  });
});
