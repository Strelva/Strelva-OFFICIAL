import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Permission logic for src/lib/auth.ts. Pure role→permission checks plus the
// Supabase-backed composition (membership role + super-admin override). The
// end-to-end Supabase path (assignment, last-owner guard, invite claim) lives
// in auth-supabase-path.test.ts.

const mockInspect = vi.hoisted(() => vi.fn(async () => false));
vi.mock("@/platform/infra/inspect-mode", () => ({ isInspecting: mockInspect }));
const mockGetSessionUser = vi.fn();
const mockGetMembershipRole = vi.fn();
const mockIsSuperAdminUser = vi.fn();

vi.mock("@/platform/infra/db/server-client", () => ({
  isSupabaseAuthConfigured: () => true,
  getSessionUser: () => mockGetSessionUser(),
}));

vi.mock("@/platform/infra/db/repositories", () => ({
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

vi.mock("@/platform/infra/redis", () => ({
  getRedis: () => undefined,
}));

const VERIFIED = { id: "u-123", email: "owner@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };

describe("auth permission helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockInspect.mockResolvedValue(false);
    vi.stubEnv("SCAFFOLD_DEV_UNGATED_ACCESS", undefined);
    vi.stubEnv("REB_DEV_UNGATED_ACCESS", "0");
    mockGetSessionUser.mockResolvedValue(VERIFIED);
    mockGetMembershipRole.mockResolvedValue(null);
    mockIsSuperAdminUser.mockResolvedValue(false);
  });

  it("requires owner for domains, billing, team, and publishing", async () => {
    const { roleHasPermission } = await import("@/platform/infra/auth");

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

    const { hasTenantAccess, hasTenantPermission } = await import("@/platform/infra/auth");

    expect(await hasTenantAccess("gldf")).toBe(true);
    expect(await hasTenantPermission("gldf", "tenant:read")).toBe(true);
    expect(await hasTenantPermission("gldf", "content:write")).toBe(false);
    expect(await hasTenantPermission("gldf", "billing:manage")).toBe(false);
  });

  it("keeps platform support reads but refuses every client write permission", async () => {
    mockIsSuperAdminUser.mockResolvedValue(true);
    const { hasTenantAccess, hasTenantPermission, requireTenantPermissions } = await import("@/platform/infra/auth");
    expect(await hasTenantAccess("any-tenant")).toBe(true);
    expect(await hasTenantPermission("any-tenant", "tenant:read")).toBe(true);
    for (const permission of ["content:write", "settings:write", "publishing:manage", "billing:manage", "team:manage", "domains:manage"] as const) {
      expect(await hasTenantPermission("any-tenant", permission)).toBe(false);
      expect((await requireTenantPermissions("any-tenant", ["tenant:read", permission]))?.status).toBe(403);
    }
  });

  it("uses actual membership when one person holds both hats and never upgrades a viewer", async () => {
    mockIsSuperAdminUser.mockResolvedValue(true);
    const { getTenantRole, requireTenantPermission } = await import("@/platform/infra/auth");
    mockGetMembershipRole.mockResolvedValue("owner");
    expect(await getTenantRole("client")).toBe("owner");
    expect(await requireTenantPermission("client", "content:write")).toBeNull();
    mockGetMembershipRole.mockResolvedValue("viewer");
    expect(await getTenantRole("client")).toBe("viewer");
    expect((await requireTenantPermission("client", "content:write"))?.status).toBe(403);
    mockGetMembershipRole.mockRejectedValue(new Error("membership unavailable"));
    await expect(requireTenantPermission("client", "content:write")).rejects.toThrow("membership unavailable");
  });

  it("keeps inspection read-only even for an ordinary owner", async () => {
    mockGetMembershipRole.mockResolvedValue("owner"); mockInspect.mockResolvedValue(true);
    const { hasTenantPermission, requireTenantPermission } = await import("@/platform/infra/auth");
    expect(await hasTenantPermission("client", "tenant:read")).toBe(true);
    expect(await hasTenantPermission("client", "content:write")).toBe(false);
    expect((await requireTenantPermission("client", "settings:write"))?.status).toBe(403);
  });

  it("treats local dev access as super admin outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REB_DEV_UNGATED_ACCESS", "1");
    mockGetSessionUser.mockResolvedValue(null);

    const { isSuperAdmin } = await import("@/platform/infra/auth");

    expect(await isSuperAdmin()).toBe(true);
  });
});
