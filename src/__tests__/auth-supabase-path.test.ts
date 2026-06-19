import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Supabase-auth path coverage for src/lib/auth.ts (migration Phase 4). The Clerk
// path is covered by auth-permissions.test.ts; here the backend switch is forced
// ON by mocking isSupabaseAuthConfigured() → true, and we assert the two
// invariants survive: the verified-email gate and the last-owner guard.

const mockGetSessionUser = vi.fn();
const mockGetMembershipRole = vi.fn();
const mockListTenantOwnerIds = vi.fn();
const mockIsSuperAdminUser = vi.fn();
const mockUpsertMembership = vi.fn();
const mockGetPendingInvite = vi.fn();
const mockMarkInviteClaimed = vi.fn();
const mockGetTenantConfig = vi.fn();
const mockGetRedis = vi.fn();

vi.mock("../lib/db/server-client", () => ({
  isSupabaseAuthConfigured: () => true,
  getSessionUser: () => mockGetSessionUser(),
}));

vi.mock("../lib/db/repositories", () => ({
  getMembershipRole: (...a: unknown[]) => mockGetMembershipRole(...a),
  listTenantOwnerIds: (...a: unknown[]) => mockListTenantOwnerIds(...a),
  isSuperAdminUser: (...a: unknown[]) => mockIsSuperAdminUser(...a),
  upsertMembership: (...a: unknown[]) => mockUpsertMembership(...a),
  getPendingInvite: (...a: unknown[]) => mockGetPendingInvite(...a),
  markInviteClaimed: (...a: unknown[]) => mockMarkInviteClaimed(...a),
}));

// Keep Clerk + tenant + redis imports inert/controlled.
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  clerkClient: vi.fn(),
}));
vi.mock("../lib/tenants", () => ({
  getTenantConfig: (...a: unknown[]) => mockGetTenantConfig(...a),
}));
vi.mock("../lib/redis", () => ({
  getRedis: () => mockGetRedis(),
}));

const VERIFIED = { id: "u-123", email: "owner@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };
const UNVERIFIED = { id: "u-123", email: "owner@example.com", email_confirmed_at: null };

describe("auth — Supabase path", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionUser.mockResolvedValue(VERIFIED);
    mockGetMembershipRole.mockResolvedValue(null);
    mockListTenantOwnerIds.mockResolvedValue([]);
    mockIsSuperAdminUser.mockResolvedValue(false);
    mockUpsertMembership.mockResolvedValue(undefined);
    mockGetPendingInvite.mockResolvedValue(null);
    mockMarkInviteClaimed.mockResolvedValue(undefined);
    mockGetTenantConfig.mockResolvedValue({ id: "gldf" });
    mockGetRedis.mockReturnValue(undefined); // no lock available -> guard uses owner count only
  });

  it("grants access from a membership row", async () => {
    const { hasTenantAccess, getTenantRole } = await import("../lib/auth");
    mockGetMembershipRole.mockResolvedValue("viewer");
    expect(await hasTenantAccess("gldf")).toBe(true);
    expect(await getTenantRole("gldf")).toBe("viewer");
  });

  it("denies access with no membership and not super-admin", async () => {
    const { hasTenantAccess, getTenantRole } = await import("../lib/auth");
    expect(await hasTenantAccess("gldf")).toBe(false);
    expect(await getTenantRole("gldf")).toBe(null);
  });

  it("super-admin sees every tenant", async () => {
    const { hasTenantAccess, getTenantRole } = await import("../lib/auth");
    mockIsSuperAdminUser.mockResolvedValue(true);
    expect(await hasTenantAccess("gldf")).toBe(true);
    expect(await getTenantRole("gldf")).toBe("super_admin");
  });

  it("verified-email gate: unconfirmed email is never super-admin", async () => {
    const { isSuperAdmin } = await import("../lib/auth");
    mockGetSessionUser.mockResolvedValue(UNVERIFIED);
    mockIsSuperAdminUser.mockResolvedValue(true); // would pass if the gate were missing
    expect(await isSuperAdmin()).toBe(false);
    expect(mockIsSuperAdminUser).not.toHaveBeenCalled();
  });

  it("assigns a membership (promotion)", async () => {
    const { assignUserToTenant } = await import("../lib/auth");
    const ok = await assignUserToTenant("u-1", "gldf", "owner");
    expect(ok).toBe(true);
    expect(mockUpsertMembership).toHaveBeenCalledWith({ user_id: "u-1", tenant_id: "gldf", role: "owner" });
  });

  it("last-owner guard: refuses to demote the sole owner", async () => {
    const { assignUserToTenant, LastOwnerError } = await import("../lib/auth");
    mockGetMembershipRole.mockResolvedValue("owner");
    mockListTenantOwnerIds.mockResolvedValue(["u-123"]); // only owner
    await expect(assignUserToTenant("u-123", "gldf", "viewer")).rejects.toBeInstanceOf(LastOwnerError);
    expect(mockUpsertMembership).not.toHaveBeenCalled();
  });

  it("last-owner guard: allows demotion when another owner exists", async () => {
    const { assignUserToTenant } = await import("../lib/auth");
    mockGetMembershipRole.mockResolvedValue("owner");
    mockListTenantOwnerIds.mockResolvedValue(["u-123", "u-999"]);
    const ok = await assignUserToTenant("u-123", "gldf", "viewer");
    expect(ok).toBe(true);
    expect(mockUpsertMembership).toHaveBeenCalledWith({ user_id: "u-123", tenant_id: "gldf", role: "viewer" });
  });

  it("invite claim: verified-email gate blocks unconfirmed emails", async () => {
    const { claimPendingInviteForCurrentUser } = await import("../lib/auth");
    mockGetSessionUser.mockResolvedValue(UNVERIFIED);
    expect(await claimPendingInviteForCurrentUser()).toBe(null);
    expect(mockGetPendingInvite).not.toHaveBeenCalled();
  });

  it("invite claim: assigns membership then marks the invite claimed", async () => {
    const { claimPendingInviteForCurrentUser } = await import("../lib/auth");
    mockGetPendingInvite.mockResolvedValue({ tenant_id: "gldf", role: "editor" });
    const grant = await claimPendingInviteForCurrentUser();
    expect(grant).toEqual({ email: "owner@example.com", tenant: "gldf", role: "editor" });
    expect(mockUpsertMembership).toHaveBeenCalledWith({ user_id: "u-123", tenant_id: "gldf", role: "editor" });
    expect(mockMarkInviteClaimed).toHaveBeenCalledWith("owner@example.com", "gldf");
  });
});
