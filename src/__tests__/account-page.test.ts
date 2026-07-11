import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuthUserId = vi.hoisted(() => vi.fn());
const mockGetCurrentUserTenants = vi.hoisted(() => vi.fn());
const mockClaimPendingInvite = vi.hoisted(() => vi.fn());
const mockGetAllTenants = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockIsSuperAdmin = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: unknown; href: string }) => ({
    type: "a",
    props: { href, children },
  }),
}));

vi.mock("@/components/auth/UseInvitedEmailButton", () => ({
  UseInvitedEmailButton: () => ({
    type: "button",
    props: { children: "Use invited email" },
  }),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuthUserId: mockGetAuthUserId,
    getCurrentUserTenants: mockGetCurrentUserTenants,
    claimPendingInviteForCurrentUser: mockClaimPendingInvite,
    isSuperAdmin: mockIsSuperAdmin,
  };
});

vi.mock("@/lib/dev-access", () => ({
  getDevAccessTenant: () => null,
  isDevAccessBypassEnabled: () => false,
}));

vi.mock("@/lib/tenant-urls", () => ({
  getTenantDashboardFallbackUrl: (tenant: { id: string }) =>
    `https://app.strelva.com/client/${tenant.id}/dashboard`,
  getTenantDashboardHost: (tenant: { id: string }) => `admin.${tenant.id}.example.com`,
}));

vi.mock("@/lib/tenants", () => ({
  getAllTenants: mockGetAllTenants,
  getTenantConfig: mockGetTenantConfig,
  isActiveTenant: (tenant: { active?: boolean }) => tenant.active !== false,
}));

function textFrom(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFrom).join(" ");
  if (typeof node === "object" && "props" in node) {
    const element = node as {
      type?: unknown;
      props?: { children?: unknown };
    };
    if (typeof element.type === "function") {
      return textFrom(element.type(element.props || {}));
    }
    return textFrom(element.props?.children);
  }
  return "";
}

describe("account page access handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUserId.mockResolvedValue("user_123");
    mockGetCurrentUserTenants.mockResolvedValue(["missing-a", "missing-b"]);
    mockClaimPendingInvite.mockResolvedValue(null);
    mockGetAllTenants.mockResolvedValue([]);
    mockGetTenantConfig.mockResolvedValue(undefined);
    mockIsSuperAdmin.mockResolvedValue(false);
  });

  it("shows recovery guidance when tenant grants no longer resolve", async () => {
    const { default: AccountPage } = await import("@/app/(marketing)/account/page");

    const page = await AccountPage();
    const text = textFrom(page);

    expect(mockGetTenantConfig).toHaveBeenCalledWith("missing-a");
    expect(mockGetTenantConfig).toHaveBeenCalledWith("missing-b");
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(text).toContain("No invited sites on this account");
    expect(text).toContain("Use the exact email address that received your invite");
    expect(text).toContain("signs you out so you can choose that account");
    expect(text).toContain("Use invited email");
    expect(text).toContain("jacob@strelva.com");
  });

  it("sends super-admins straight to the operator console", async () => {
    // The old per-tenant account picker was removed — a super admin landing on
    // /account is bounced to /admin (verified in account/page.tsx).
    mockIsSuperAdmin.mockResolvedValue(true);
    const { default: AccountPage } = await import("@/app/(marketing)/account/page");

    await AccountPage();

    expect(mockRedirect).toHaveBeenCalledWith("/admin");
  });
});
