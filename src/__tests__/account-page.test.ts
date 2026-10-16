import { beforeAll, describe, expect, it, vi, beforeEach } from "vitest";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockGetAuthUserId = vi.hoisted(() => vi.fn());
const mockGetCurrentUserTenants = vi.hoisted(() => vi.fn());
const mockClaimPendingInvite = vi.hoisted(() => vi.fn());
const mockGetAllTenants = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockIsSuperAdmin = vi.hoisted(() => vi.fn());
const mockGetCurrentUserEmail = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() => vi.fn());
const mockWorkspaceReleaseEnabled = vi.hoisted(() => vi.fn());
const mockInquiryReleaseEnabled = vi.hoisted(() => vi.fn());

vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mockWorkspaceReleaseEnabled }));
vi.mock("@/products/inquiries/server", () => ({ inquiryReleaseEnabled: mockInquiryReleaseEnabled }));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/components/auth/UseInvitedEmailButton", () => ({
  UseInvitedEmailButton: () => createElement("button", { type: "button" }, "Use my invited email"),
}));

vi.mock("@/platform/infra/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/infra/auth")>();
  return {
    ...actual,
    getAuthUserId: mockGetAuthUserId,
    getCurrentUserTenants: mockGetCurrentUserTenants,
    claimPendingInviteForCurrentUser: mockClaimPendingInvite,
    isSuperAdmin: mockIsSuperAdmin,
    getCurrentUserEmail: mockGetCurrentUserEmail,
  };
});

vi.mock("@/platform/infra/dev-access", () => ({
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

/** The rendered page as text; the XA views are real React components with hooks. */
function textFrom(node: unknown): string {
  if (!isValidElement(node)) return "";
  return renderToStaticMarkup(node).replace(/<[^>]+>/g, " ").replace(/&#x27;|&rsquo;/g, "’").replace(/\s+/g, " ");
}

describe("account page access handoff", () => {
  // The first import compiles the XA entry views; keep it out of each test's time budget.
  beforeAll(async () => { await import("@/app/(marketing)/account/page"); }, 60_000);
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspaceReleaseEnabled.mockReturnValue(false);
    mockInquiryReleaseEnabled.mockReturnValue(false);
    mockRedirect.mockImplementation((target: string) => { throw new Error(`REDIRECT:${target}`); });
    mockGetAuthUserId.mockResolvedValue("user_123");
    mockGetCurrentUserTenants.mockResolvedValue(["missing-a", "missing-b"]);
    mockClaimPendingInvite.mockResolvedValue(null);
    mockGetAllTenants.mockResolvedValue([]);
    mockGetTenantConfig.mockResolvedValue(undefined);
    mockIsSuperAdmin.mockResolvedValue(false);
    mockGetCurrentUserEmail.mockResolvedValue(null);
  });

  it("shows recovery guidance when tenant grants no longer resolve", async () => {
    const { default: AccountPage } = await import("@/app/(marketing)/account/page");

    const page = await AccountPage({});
    const text = textFrom(page);

    expect(mockGetTenantConfig).toHaveBeenCalledWith("missing-a");
    expect(mockGetTenantConfig).toHaveBeenCalledWith("missing-b");
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(text).toContain("This email isn’t on a business yet.");
    expect(text).toContain("Sign in with the address the invitation went to.");
    expect(text).toContain("Use my invited email");
    expect(text).toContain("Email Strelva support");
    expect(renderToStaticMarkup(page as never)).toContain("mailto:hello@strelva.com");
    expect(text).not.toContain("jacob@strelva.com");
    expect(text).not.toContain("Request your build");
  });

  it("asks which business to open when several use this email, without builder words", async () => {
    mockGetCurrentUserTenants.mockResolvedValue(["harbor", "lakeview"]);
    mockGetCurrentUserEmail.mockResolvedValue("dr.lin@harbordental.com");
    mockGetTenantConfig.mockImplementation(async (id: string) => ({ id, active: true, siteName: id === "harbor" ? "Harbor Dental" : "Lakeview Yoga", productionDomain: id === "harbor" ? "harbordental.com" : undefined }));
    const { default: AccountPage } = await import("@/app/(marketing)/account/page");
    const page = await AccountPage({});
    const html = renderToStaticMarkup(page as never);
    expect(html).toContain("Which business do you want to open?");
    expect(html).toContain("2 businesses use dr.lin@harbordental.com.");
    expect(html).toContain('href="https://app.strelva.com/client/harbor/dashboard"');
    expect(html).toContain("harbordental.com");
    expect(html).toContain("No public website yet");
    expect(html).not.toContain("admin.");
    expect(html).not.toContain(">Open<");
    expect(html).not.toContain("Fallback via strelva.com");
    expect(html).not.toContain("Choose a site");
  });

  it("sends super-admins straight to the operator console", async () => {
    // The old per-tenant account picker was removed — a super admin landing on
    // /account is bounced to /admin (verified in account/page.tsx).
    mockIsSuperAdmin.mockResolvedValue(true);
    const { default: AccountPage } = await import("@/app/(marketing)/account/page");

    await expect(AccountPage({})).rejects.toThrow("REDIRECT:/admin");

    expect(mockClaimPendingInvite).not.toHaveBeenCalled();
  });

  it("opens the inquiry business entry only when its release is enabled", async () => {
    mockInquiryReleaseEnabled.mockReturnValue(true);
    const { default: AccountPage } = await import("@/app/(marketing)/account/page");
    await expect(AccountPage({})).rejects.toThrow("REDIRECT:/business");
    expect(mockClaimPendingInvite).toHaveBeenCalledOnce();
  });

  it("preserves explicit managed-account recovery during the inquiry release", async () => {
    mockInquiryReleaseEnabled.mockReturnValue(true);
    const { default: AccountPage } = await import("@/app/(marketing)/account/page");
    const page = await AccountPage({ searchParams: Promise.resolve({ managed: "1" }) });
    expect(textFrom(page)).toContain("This email isn’t on a business yet.");
  });

  it("claims a managed invitation before the shared workspace landing", async () => {
    mockWorkspaceReleaseEnabled.mockReturnValue(true);
    mockClaimPendingInvite.mockResolvedValue({ tenant: "harbor" });
    const { default: AccountPage } = await import("@/app/(marketing)/account/page");

    await expect(AccountPage({})).rejects.toThrow("REDIRECT:/workspace");

    expect(mockClaimPendingInvite).toHaveBeenCalledOnce();
    expect(mockGetTenantConfig).not.toHaveBeenCalled();
    expect(mockGetCurrentUserTenants).not.toHaveBeenCalled();
  });

  it("reopens a supported public result after claiming an invitation", async () => {
    mockWorkspaceReleaseEnabled.mockReturnValue(true);
    mockClaimPendingInvite.mockResolvedValue({ tenant: "harbor" });
    const { default: AccountPage } = await import("@/app/(marketing)/account/page");

    await expect(AccountPage({
      searchParams: Promise.resolve({ next: "/workspace?save=scan_public123" }),
    })).rejects.toThrow("REDIRECT:/workspace?save=scan_public123");

    expect(mockClaimPendingInvite).toHaveBeenCalledOnce();
  });

  it("keeps invitation failures from being hidden behind a successful landing", async () => {
    mockWorkspaceReleaseEnabled.mockReturnValue(true);
    mockClaimPendingInvite.mockRejectedValueOnce(new Error("Invitation unavailable"));
    const { default: AccountPage } = await import("@/app/(marketing)/account/page");

    await expect(AccountPage({})).rejects.toThrow("Invitation unavailable");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("preserves the explicit managed website destination during the release", async () => {
    mockWorkspaceReleaseEnabled.mockReturnValue(true);
    mockGetCurrentUserTenants.mockResolvedValue(["harbor"]);
    mockGetTenantConfig.mockResolvedValue({ id: "harbor", active: true });
    const { default: AccountPage } = await import("@/app/(marketing)/account/page");

    await expect(AccountPage({ searchParams: Promise.resolve({ managed: "1" }) }))
      .rejects.toThrow("REDIRECT:https://app.strelva.com/client/harbor/dashboard");
  });

  it("keeps recovery reachable when the explicit managed path has no sites", async () => {
    mockWorkspaceReleaseEnabled.mockReturnValue(true);
    mockGetCurrentUserTenants.mockResolvedValue([]);
    const { default: AccountPage } = await import("@/app/(marketing)/account/page");

    const page = await AccountPage({ searchParams: Promise.resolve({ managed: "1" }) });
    expect(textFrom(page)).toContain("This email isn’t on a business yet.");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("preserves the existing site destination when the release is closed", async () => {
    mockGetCurrentUserTenants.mockResolvedValue(["harbor"]);
    mockGetTenantConfig.mockResolvedValue({ id: "harbor", active: true });
    const { default: AccountPage } = await import("@/app/(marketing)/account/page");

    await expect(AccountPage({})).rejects.toThrow("REDIRECT:https://app.strelva.com/client/harbor/dashboard");
  });

  it("requires authentication before any shared workspace landing", async () => {
    mockWorkspaceReleaseEnabled.mockReturnValue(true);
    mockGetAuthUserId.mockResolvedValue(null);
    const { default: AccountPage } = await import("@/app/(marketing)/account/page");

    await expect(AccountPage({})).rejects.toThrow("REDIRECT:/sign-in");
    expect(mockClaimPendingInvite).not.toHaveBeenCalled();
  });

  it("keeps a safe workspace result when a signed-out account link is opened", async () => {
    mockWorkspaceReleaseEnabled.mockReturnValue(true);
    mockGetAuthUserId.mockResolvedValue(null);
    const { default: AccountPage } = await import("@/app/(marketing)/account/page");

    await expect(AccountPage({
      searchParams: Promise.resolve({ next: "/workspace?save=scan_public123" }),
    })).rejects.toThrow("REDIRECT:/sign-in?next=%2Fworkspace%3Fsave%3Dscan_public123");
  });
});
