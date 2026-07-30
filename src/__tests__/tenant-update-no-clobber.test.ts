import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * updateTenant's Postgres path upserts exactly the columns tenantToRow emits,
 * and tenantToRow ALWAYS emits site_name + created_at (the generated Insert type
 * requires site_name). So a partial update that doesn't touch them must backfill
 * both from the existing row — otherwise setting e.g. customRepo would blank the
 * business name and reset created_at (which feeds milestone.ts's 90-day baseline).
 */

const mockSourceIsPostgres = vi.hoisted(() => vi.fn(() => true));
const mockGetTenant = vi.hoisted(() => vi.fn());
const mockUpsertTenant = vi.hoisted(() => vi.fn());
const mockListAllTenants = vi.hoisted(() => vi.fn(async () => []));
const mockListAllDomainClaims = vi.hoisted(() => vi.fn(async () => []));
const mockListDomainClaims = vi.hoisted(() => vi.fn(async () => []));
const mockReplaceDomainClaims = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/db/source-flags", () => ({ tenantsSourceIsPostgres: mockSourceIsPostgres }));
vi.mock("@/lib/db/repositories", () => ({
  getTenant: mockGetTenant,
  upsertTenant: mockUpsertTenant,
  listAllTenants: mockListAllTenants,
  listAllDomainClaims: mockListAllDomainClaims,
  listDomainClaims: mockListDomainClaims,
  replaceDomainClaims: mockReplaceDomainClaims,
}));
vi.mock("@/lib/redis", () => ({ getRedis: () => null }));
// Sanity dual-write is best-effort; stub it so the test never touches a client.
vi.mock("@/lib/sanity", () => ({ getSanityClient: () => ({ fetch: async () => null }) }));

import { updateTenant } from "@/lib/tenants";

// Minimal existing row — rowToTenant tolerates missing columns (maps to undefined).
const EXISTING_ROW = {
  id: "gldf",
  site_name: "Great Lakes Dried Fruit",
  created_at: "2026-03-30",
  delivery_model: "custom_repo",
  active: true,
} as unknown as Parameters<typeof mockUpsertTenant>[0];

beforeEach(() => {
  vi.clearAllMocks();
  mockSourceIsPostgres.mockReturnValue(true);
  mockGetTenant.mockResolvedValue(EXISTING_ROW);
  mockUpsertTenant.mockResolvedValue(undefined);
});

describe("updateTenant — partial update does not clobber site_name / created_at", () => {
  it("backfills both from the existing row when the update omits them", async () => {
    await updateTenant("gldf", {
      customRepo: { capabilityManifestUrl: "https://gldf.com/api/capabilities" },
    });

    expect(mockUpsertTenant).toHaveBeenCalledTimes(1);
    const row = mockUpsertTenant.mock.calls[0]![0] as {
      site_name: string;
      created_at: string;
      custom_repo: unknown;
    };
    expect(row.site_name).toBe("Great Lakes Dried Fruit"); // NOT "" (would blank the name)
    expect(row.created_at).toBe("2026-03-30"); // NOT today (would reset the milestone clock)
    expect(row.custom_repo).toEqual({ capabilityManifestUrl: "https://gldf.com/api/capabilities" });
  });

  it("still lets an explicit siteName/createdAt update through", async () => {
    await updateTenant("gldf", { siteName: "GLDF Rebrand" });
    const row = mockUpsertTenant.mock.calls[0]![0] as { site_name: string };
    expect(row.site_name).toBe("GLDF Rebrand");
  });
});
