import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListAllTenants = vi.hoisted(() => vi.fn());
const mockListAllDomainClaims = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/source-flags", () => ({ tenantsSourceIsPostgres: () => true }));
vi.mock("@/lib/redis", () => ({ getRedis: () => null }));
vi.mock("@/lib/db/repositories", () => ({
  listAllTenants: mockListAllTenants,
}));
vi.mock("@/lib/db/domain-claims", () => ({
  listAllDomainClaims: mockListAllDomainClaims,
  listDomainClaims: vi.fn(async () => []),
  replaceDomainClaims: vi.fn(async () => undefined),
  domainClaimToRow: (claim: unknown) => claim,
  rowToDomainClaim: (row: Record<string, unknown>) => ({
    tenantId: row.tenant_id,
    domain: row.domain,
    role: row.role,
    status: row.status,
    dnsStatus: row.dns_status,
    sslStatus: row.ssl_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
}));

describe("custom-domain routing verification boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    mockListAllTenants.mockResolvedValue([
      { id: "pending", site_name: "Pending", active: true, custom_domains: ["pending.example.com"] },
      { id: "verified", site_name: "Verified", active: true, custom_domains: ["verified.example.com"] },
    ]);
    mockListAllDomainClaims.mockResolvedValue([
      {
        tenant_id: "pending",
        domain: "pending.example.com",
        role: "additional",
        status: "pending",
        dns_status: "unknown",
        ssl_status: "pending",
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
      },
      {
        tenant_id: "verified",
        domain: "verified.example.com",
        role: "additional",
        status: "verified",
        dns_status: "configured",
        ssl_status: "issued",
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
      },
    ]);
  });

  it("does not route a custom domain until its Postgres claim is verified", async () => {
    const { getTenantByDomain } = await import("@/lib/tenants");
    await expect(getTenantByDomain("pending.example.com")).resolves.toBeNull();
    await expect(getTenantByDomain("verified.example.com")).resolves.toEqual({
      tenantId: "verified",
      isAdmin: false,
    });
  });
});
