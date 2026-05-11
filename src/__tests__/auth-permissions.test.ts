import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCurrentUser = vi.fn();
const mockGetUser = vi.fn();
const mockUpdateUserMetadata = vi.fn();
const mockGetTenantConfig = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(() => Promise.resolve({ userId: "user_123" })),
  currentUser: () => mockCurrentUser(),
  clerkClient: vi.fn(() =>
    Promise.resolve({
      users: {
        getUser: mockGetUser,
        updateUserMetadata: mockUpdateUserMetadata,
      },
    })
  ),
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
    mockGetTenantConfig.mockResolvedValue({ id: "gldf" });
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
      emailAddresses: [{ emailAddress: "viewer@example.com" }],
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
    process.env.SUPER_ADMIN_EMAILS = "jacob@scaffoldweb.com";
    mockCurrentUser.mockResolvedValue({
      id: "admin_123",
      emailAddresses: [{ emailAddress: "jacob@scaffoldweb.com" }],
      publicMetadata: { tenants: [] },
    });

    const { hasTenantPermission } = await import("../lib/auth");

    expect(await hasTenantPermission("any-tenant", "billing:manage")).toBe(true);
    expect(await hasTenantPermission("any-tenant", "team:manage")).toBe(true);
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
});
