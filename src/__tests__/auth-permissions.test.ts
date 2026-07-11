import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Permission logic for src/lib/auth.ts. Pure role→permission checks plus the
// Supabase-backed composition (membership role + super-admin override). The
// end-to-end Supabase path (assignment, last-owner guard, invite claim) lives
// in auth-supabase-path.test.ts.

const mockGetSessionUser = vi.fn();
const mockGetMembershipRole = vi.fn();
const mockIsSuperAdminUser = vi.fn();

vi.mock("../lib/db/server-client", () => ({
  isSupabaseAuthConfigured: () => true,
  getSessionUser: () => mockGetSessionUser(),
}));

vi.mock("../lib/db/repositories", () => ({
  getMembershipRole: (...a: unknown[]) => mockGetMembershipRole(...a),
  isSuperAdminUser: (...a: unknown[]) => mockIsSuperAdminUser(...a),
  listMembershipsForUser: vi.fn(),
  listTenantOwnerIds: vi.fn(),
  upsertMembership: vi.fn(),
  getPendingInvite: vi.fn(),
  markInviteClaimed: vi.fn(),
  getUserByEmail: vi.fn(),
}));

vi.mock("../lib/tenants", () => ({
  getTenantConfig: vi.fn(),
}));

vi.mock("../lib/redis", () => ({
  getRedis: () => undefined,
}));

const VERIFIED = { id: "u-123", email: "owner@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };

describe("auth permission helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionUser.mockResolvedValue(VERIFIED);
    mockGetMembershipRole.mockResolvedValue(null);
    mockIsSuperAdminUser.mockResolvedValue(false);
  });

  it("requires owner for domains, billing, team, and publishing", async () => {
    const { roleHasPermission } = await import("../lib/auth");

    for (const role of ["viewer", "editor", "admin"] as const) {
      expect(roleHasPermission(role, "domains:manage")).toBe(false);
      expect(roleHasPermission(role, "billing:manage")).toBe(false);
      expect(roleHasPermission(role, "team:manage")).toBe(false);
      expect(roleHasPermission(role, "publishing:manage")).toBe(false);
    }

    expect(roleHasPermission("owner", "domains:manage")).toBe(true);
    expect(roleHasPermission("owner", "billing:manage")).toBe(true);
    expect(roleHasPermission("owner", "team:manage")).toBe(true);
    expect(roleHasPermission("owner", "publishing:manage")).toBe(true);
  });

  it("allows viewers to read tenant access but blocks write permissions", async () => {
    mockGetMembershipRole.mockResolvedValue("viewer");

    const { hasTenantAccess, hasTenantPermission } = await import("../lib/auth");

    expect(await hasTenantAccess("gldf")).toBe(true);
    expect(await hasTenantPermission("gldf", "tenant:read")).toBe(true);
    expect(await hasTenantPermission("gldf", "content:write")).toBe(false);
    expect(await hasTenantPermission("gldf", "billing:manage")).toBe(false);
  });

  it("lets scaffold super admins override tenant permissions", async () => {
    mockIsSuperAdminUser.mockResolvedValue(true);

    const { hasTenantPermission } = await import("../lib/auth");

    expect(await hasTenantPermission("any-tenant", "billing:manage")).toBe(true);
    expect(await hasTenantPermission("any-tenant", "team:manage")).toBe(true);
  });

  it("treats local dev access as super admin outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REB_DEV_UNGATED_ACCESS", "1");
    mockGetSessionUser.mockResolvedValue(null);

    const { isSuperAdmin } = await import("../lib/auth");

    expect(await isSuperAdmin()).toBe(true);
  });
});
