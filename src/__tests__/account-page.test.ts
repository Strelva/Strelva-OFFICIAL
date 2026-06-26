import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockCurrentUser = vi.hoisted(() => vi.fn());
const mockGetAllTenants = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockIsSuperAdmin = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  currentUser: mockCurrentUser,
}));

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
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockCurrentUser.mockResolvedValue({
      publicMetadata: { tenants: ["missing-a", "missing-b"] },
    });
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

  it("hides archived tenants from the super-admin account picker", async () => {
    mockIsSuperAdmin.mockResolvedValue(true);
    mockGetAllTenants.mockResolvedValue([
      { id: "gldf", siteName: "Great Lakes Dried Fruit", active: true },
      { id: "rohlax-wellness", siteName: "Old Rohlax Duplicate", active: false },
    ]);
    const { default: AccountPage } = await import("@/app/(marketing)/account/page");

    const page = await AccountPage();
    const text = textFrom(page);

    expect(text).toContain("Great Lakes Dried Fruit");
    expect(text).not.toContain("Old Rohlax Duplicate");
  });
});
