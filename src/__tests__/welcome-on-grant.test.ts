import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The invites route must fire sendWelcomeEmail when a genuinely-NEW owner is
// granted dashboard access — and must NOT fire it when an already-existing user
// is (re)assigned to the tenant (that path is a re-invite, never a first grant).

const mockAssignUserToTenant = vi.hoisted(() => vi.fn());
const mockCreateInvite = vi.hoisted(() => vi.fn());
const mockGetCurrentUserEmail = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockGetTenantDashboardUrl = vi.hoisted(() => vi.fn());
const mockFindUserIdByEmail = vi.hoisted(() => vi.fn());
const mockRequireTenantPermission = vi.hoisted(() => vi.fn());
const mockGetActorContext = vi.hoisted(() => vi.fn());
const mockLogAuditEvent = vi.hoisted(() => vi.fn());
const mockSendWelcomeEmail = vi.hoisted(() => vi.fn());
const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  CLIENT_ROLES: ["viewer", "editor", "admin", "owner"],
  assignUserToTenant: mockAssignUserToTenant,
  getCurrentUserEmail: mockGetCurrentUserEmail,
  getActorContext: mockGetActorContext,
  isSuperAdmin: vi.fn(() => Promise.resolve(true)),
  requireTenantPermission: mockRequireTenantPermission,
  findUserIdByEmail: mockFindUserIdByEmail,
}));

vi.mock("@/lib/storage", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/invites", () => ({ createInvite: mockCreateInvite }));
vi.mock("@/lib/tenant-urls", () => ({ getTenantDashboardUrl: mockGetTenantDashboardUrl }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mockGetTenantConfig }));
vi.mock("@/lib/delivery-email", () => ({ sendWelcomeEmail: mockSendWelcomeEmail }));

vi.mock("resend", () => ({
  Resend: vi.fn(function Resend() {
    return { emails: { send: mockSendEmail } };
  }),
}));

describe("welcome email on new-owner access grant", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_DOMAIN = "updates.strelva.com";
    process.env.EMAIL_SENDING_ENABLED = "true";
    mockGetTenantConfig.mockResolvedValue({
      id: "gldf",
      siteName: "Great Lakes Dried Fruit",
      ownerName: "  Sam  ",
    });
    mockGetTenantDashboardUrl.mockReturnValue("https://admin.greatlakesdriedfruit.com/dashboard");
    mockFindUserIdByEmail.mockResolvedValue(null);
    mockCreateInvite.mockResolvedValue(true);
    mockGetCurrentUserEmail.mockResolvedValue("admin@example.com");
    mockSendEmail.mockResolvedValue({ data: { id: "email_123" }, error: null, headers: null });
    mockSendWelcomeEmail.mockResolvedValue(true);
    mockGetActorContext.mockResolvedValue({ email: "admin@example.com" });
    mockLogAuditEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("fires the welcome email for a NEW owner", async () => {
    const { POST } = await import("@/app/api/admin/invites/route");
    const res = await POST(new Request("http://localhost/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@example.com", tenant: "gldf", role: "owner" }),
    }));

    expect(res.status).toBe(200);
    expect(mockSendWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(mockSendWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@example.com",
        businessName: "Great Lakes Dried Fruit",
        ownerName: "Sam", // trimmed
        dashboardUrl: "https://admin.greatlakesdriedfruit.com/dashboard",
      }),
    );
    expect(mockGetTenantDashboardUrl).toHaveBeenCalledWith(
      expect.objectContaining({ id: "gldf" }),
      "/dashboard",
      "production",
    );
  });

  it("does NOT fire the welcome email for a non-owner invite", async () => {
    const { POST } = await import("@/app/api/admin/invites/route");
    await POST(new Request("http://localhost/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "editor@example.com", tenant: "gldf", role: "editor" }),
    }));

    expect(mockSendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("does NOT fire the welcome email on re-invite of an EXISTING user", async () => {
    mockFindUserIdByEmail.mockResolvedValue("user_existing");
    mockAssignUserToTenant.mockResolvedValue(true);

    const { POST } = await import("@/app/api/admin/invites/route");
    const res = await POST(new Request("http://localhost/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@example.com", tenant: "gldf", role: "owner" }),
    }));

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload).toMatchObject({ existingUser: true });
    expect(mockSendWelcomeEmail).not.toHaveBeenCalled();
    expect(mockCreateInvite).not.toHaveBeenCalled();
  });
});
