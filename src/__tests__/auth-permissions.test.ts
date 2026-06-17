import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCurrentUser = vi.fn();
const mockAuth = vi.fn();
const mockConsumeInvite = vi.fn();
const mockGetInvite = vi.fn();
const mockGetUser = vi.fn();
const mockGetUserList = vi.fn();
const mockUpdateUserMetadata = vi.fn();
const mockGetTenantConfig = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
  currentUser: () => mockCurrentUser(),
  clerkClient: vi.fn(() =>
    Promise.resolve({
      users: {
        getUser: mockGetUser,
        getUserList: mockGetUserList,
        updateUserMetadata: mockUpdateUserMetadata,
      },
    })
  ),
}));

vi.mock("../lib/invites", () => ({
  consumeInvite: (...args: unknown[]) => mockConsumeInvite(...args),
  getInvite: (...args: unknown[]) => mockGetInvite(...args),
}));

vi.mock("../lib/tenants", () => ({
  getTenantConfig: (...args: unknown[]) => mockGetTenantConfig(...args),
}));

describe("auth permission helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SUPER_ADMIN_EMAILS;
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockGetInvite.mockResolvedValue(null);
    mockConsumeInvite.mockResolvedValue(null);
    mockGetTenantConfig.mockResolvedValue({ id: "gldf" });
    mockGetUserList.mockResolvedValue({ data: [] });
  });

  it("parses legacy tenant arrays as owner access", async () => {
    const { getRoleForTenantFromMetadata, roleHasPermission } = await import("../lib/auth");

    const role = getRoleForTenantFromMetadata({ tenants: ["gldf"] }, "gldf");

    expect(role).toBe("owner");
    expect(roleHasPermission(role!, "domains:manage")).toBe(true);
    expect(roleHasPermission(role!, "billing:manage")).toBe(true);
    expect(roleHasPermission(role!, "team:manage")).toBe(true);
    expect(roleHasPermission(role!, "publishing:manage")).toBe(true);
  });

  it("honors explicit tenantRoles over legacy tenant arrays", async () => {
    const { getRoleForTenantFromMetadata, roleHasPermission } = await import("../lib/auth");

    const role = getRoleForTenantFromMetadata(
      { tenants: ["gldf"], tenantRoles: { gldf: "editor" } },
      "gldf"
    );

    expect(role).toBe("editor");
    expect(roleHasPermission(role!, "content:write")).toBe(true);
    expect(roleHasPermission(role!, "domains:manage")).toBe(false);
  });

  it("allows viewers to read tenant access but blocks write permissions", async () => {
    mockCurrentUser.mockResolvedValue({
      id: "user_123",
      emailAddresses: [{ emailAddress: "viewer@example.com", verification: { status: "verified" } }],
      publicMetadata: { tenants: ["gldf"], tenantRoles: { gldf: "viewer" } },
    });

    const { hasTenantAccess, hasTenantPermission } = await import("../lib/auth");

    expect(await hasTenantAccess("gldf")).toBe(true);
    expect(await hasTenantPermission("gldf", "tenant:read")).toBe(true);
    expect(await hasTenantPermission("gldf", "content:write")).toBe(false);
    expect(await hasTenantPermission("gldf", "billing:manage")).toBe(false);
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

  it("lets scaffold super admins override tenant permissions", async () => {
    process.env.SUPER_ADMIN_EMAILS = "jacob@strelva.com";
    mockCurrentUser.mockResolvedValue({
      id: "admin_123",
      emailAddresses: [{ emailAddress: "jacob@strelva.com", verification: { status: "verified" } }],
      publicMetadata: { tenants: [] },
    });

    const { hasTenantPermission } = await import("../lib/auth");

    expect(await hasTenantPermission("any-tenant", "billing:manage")).toBe(true);
    expect(await hasTenantPermission("any-tenant", "team:manage")).toBe(true);
  });

  it("does NOT grant super admin for an UNVERIFIED allowlisted email", async () => {
    // Account-takeover guard: an attacker adding an admin's email as an
    // unverified secondary address must not become super-admin.
    process.env.SUPER_ADMIN_EMAILS = "jacob@strelva.com";
    mockCurrentUser.mockResolvedValue({
      id: "attacker_1",
      emailAddresses: [
        { emailAddress: "attacker@evil.com", verification: { status: "verified" } },
        { emailAddress: "jacob@strelva.com", verification: { status: "unverified" } },
      ],
      publicMetadata: { tenants: [] },
    });

    const { isSuperAdmin } = await import("../lib/auth");
    expect(await isSuperAdmin()).toBe(false);
  });

  it("treats local dev access as super admin outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REB_DEV_UNGATED_ACCESS", "1");
    mockCurrentUser.mockResolvedValue(null);

    const { isSuperAdmin } = await import("../lib/auth");

    expect(await isSuperAdmin()).toBe(true);
  });

  it("assigns Clerk metadata with tenantRoles", async () => {
    mockGetUser.mockResolvedValue({
      publicMetadata: { tenants: ["gldf"], tenantRoles: { gldf: "viewer" } },
    });

    const { assignUserToTenant } = await import("../lib/auth");
    const assigned = await assignUserToTenant("user_123", "gldf", "admin");

    expect(assigned).toBe(true);
    expect(mockUpdateUserMetadata).toHaveBeenCalledWith("user_123", {
      publicMetadata: {
        tenants: ["gldf"],
        tenantRoles: { gldf: "admin" },
      },
    });
  });

  it("returns the user ids that own a tenant via getTenantOwnerUserIds", async () => {
    mockGetUserList.mockResolvedValue({
      data: [
        { id: "owner_1", publicMetadata: { tenantRoles: { gldf: "owner" } } },
        { id: "editor_1", publicMetadata: { tenantRoles: { gldf: "editor" } } },
        { id: "owner_other", publicMetadata: { tenantRoles: { rohlax: "owner" } } },
        { id: "owner_2", publicMetadata: { tenants: ["gldf"] } },
      ],
    });

    const { getTenantOwnerUserIds } = await import("../lib/auth");
    const owners = await getTenantOwnerUserIds("gldf");

    expect(owners).toEqual(["owner_1", "owner_2"]);
  });

  it("blocks demoting the SOLE owner of a tenant", async () => {
    mockGetUser.mockResolvedValue({
      publicMetadata: { tenants: ["gldf"], tenantRoles: { gldf: "owner" } },
    });
    mockGetUserList.mockResolvedValue({
      data: [{ id: "user_123", publicMetadata: { tenantRoles: { gldf: "owner" } } }],
    });

    const { assignUserToTenant, LastOwnerError } = await import("../lib/auth");

    await expect(assignUserToTenant("user_123", "gldf", "viewer")).rejects.toBeInstanceOf(
      LastOwnerError
    );
    expect(mockUpdateUserMetadata).not.toHaveBeenCalled();
  });

  it("allows demoting an owner when another owner exists", async () => {
    mockGetUser.mockResolvedValue({
      publicMetadata: { tenants: ["gldf"], tenantRoles: { gldf: "owner" } },
    });
    mockGetUserList.mockResolvedValue({
      data: [
        { id: "user_123", publicMetadata: { tenantRoles: { gldf: "owner" } } },
        { id: "co_owner", publicMetadata: { tenantRoles: { gldf: "owner" } } },
      ],
    });

    const { assignUserToTenant } = await import("../lib/auth");
    const assigned = await assignUserToTenant("user_123", "gldf", "editor");

    expect(assigned).toBe(true);
    expect(mockUpdateUserMetadata).toHaveBeenCalledWith("user_123", {
      publicMetadata: {
        tenants: ["gldf"],
        tenantRoles: { gldf: "editor" },
      },
    });
  });

  it("does not run the last-owner check when promoting (sole owner unaffected)", async () => {
    mockGetUser.mockResolvedValue({
      publicMetadata: { tenants: ["gldf"], tenantRoles: { gldf: "editor" } },
    });

    const { assignUserToTenant } = await import("../lib/auth");
    const assigned = await assignUserToTenant("user_123", "gldf", "owner");

    expect(assigned).toBe(true);
    // Promotion must never touch the (paginated) owner list.
    expect(mockGetUserList).not.toHaveBeenCalled();
    expect(mockUpdateUserMetadata).toHaveBeenCalledWith("user_123", {
      publicMetadata: {
        tenants: ["gldf"],
        tenantRoles: { gldf: "owner" },
      },
    });
  });

  it("claims a pending invite for the signed-in user's exact email", async () => {
    mockCurrentUser.mockResolvedValue({
      id: "user_123",
      emailAddresses: [{ emailAddress: "Owner@Example.com", verification: { status: "verified" } }],
      publicMetadata: { tenants: [] },
    });
    mockGetInvite.mockResolvedValue({
      tenant: "gldf",
      role: "owner",
      invitedAt: "2026-05-13T00:00:00.000Z",
    });
    mockGetUser.mockResolvedValue({
      publicMetadata: { tenants: [] },
    });

    const { claimPendingInviteForCurrentUser } = await import("../lib/auth");
    const claimed = await claimPendingInviteForCurrentUser("gldf");

    expect(claimed).toEqual({
      email: "owner@example.com",
      tenant: "gldf",
      role: "owner",
    });
    expect(mockGetInvite).toHaveBeenCalledWith("owner@example.com");
    expect(mockUpdateUserMetadata).toHaveBeenCalledWith("user_123", {
      publicMetadata: {
        tenants: ["gldf"],
        tenantRoles: { gldf: "owner" },
      },
    });
    expect(mockConsumeInvite).toHaveBeenCalledWith("owner@example.com");
  });

  it("leaves other-tenant invites pending on tenant-specific recovery", async () => {
    mockCurrentUser.mockResolvedValue({
      id: "user_123",
      emailAddresses: [{ emailAddress: "owner@example.com", verification: { status: "verified" } }],
      publicMetadata: { tenants: [] },
    });
    mockGetInvite.mockResolvedValue({
      tenant: "rohlax",
      role: "owner",
      invitedAt: "2026-05-13T00:00:00.000Z",
    });

    const { claimPendingInviteForCurrentUser } = await import("../lib/auth");

    await expect(claimPendingInviteForCurrentUser("gldf")).resolves.toBeNull();
    expect(mockUpdateUserMetadata).not.toHaveBeenCalled();
    expect(mockConsumeInvite).not.toHaveBeenCalled();
  });
});
