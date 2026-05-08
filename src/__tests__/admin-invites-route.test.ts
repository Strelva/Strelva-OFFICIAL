import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAssignUserToTenant = vi.hoisted(() => vi.fn());
const mockCreateInvite = vi.hoisted(() => vi.fn());
const mockGetCurrentUserEmail = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockGetTenantDashboardUrl = vi.hoisted(() => vi.fn());
const mockGetUserList = vi.hoisted(() => vi.fn());
const mockRequireTenantPermission = vi.hoisted(() => vi.fn());
const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  CLIENT_ROLES: ["viewer", "editor", "admin", "owner"],
  assignUserToTenant: mockAssignUserToTenant,
  getCurrentUserEmail: mockGetCurrentUserEmail,
  isSuperAdmin: vi.fn(() => Promise.resolve(true)),
  requireTenantPermission: mockRequireTenantPermission,
}));

vi.mock("@/lib/invites", () => ({
  createInvite: mockCreateInvite,
}));

vi.mock("@/lib/tenant-urls", () => ({
  getTenantDashboardUrl: mockGetTenantDashboardUrl,
}));

vi.mock("@/lib/tenants", () => ({
  getTenantConfig: mockGetTenantConfig,
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(() =>
    Promise.resolve({
      users: {
        getUserList: mockGetUserList,
      },
    })
  ),
}));

vi.mock("resend", () => ({
  Resend: vi.fn(function Resend() {
    return {
      emails: {
        send: mockSendEmail,
      },
    };
  }),
}));

describe("admin invites route", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_DOMAIN = "updates.scaffoldweb.com";
    mockGetTenantConfig.mockResolvedValue({
      id: "gldf",
      siteName: `A&B <script>alert("x")</script>`,
    });
    mockGetTenantDashboardUrl.mockReturnValue("https://admin.example.com/sign-up");
    mockGetUserList.mockResolvedValue({ data: [] });
    mockCreateInvite.mockResolvedValue(true);
    mockGetCurrentUserEmail.mockResolvedValue("admin@example.com");
    mockSendEmail.mockResolvedValue({ id: "email_123" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("sends invited customers both HTML and plain-text signup content", async () => {
    const { POST } = await import("@/app/api/admin/invites/route");

    const response = await POST(new Request("http://localhost/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "Owner@Example.com ", tenant: " gldf " }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      emailSent: true,
    });
    expect(mockCreateInvite).toHaveBeenCalledWith(
      "owner@example.com",
      "gldf",
      "admin@example.com",
      "owner",
    );
    expect(mockGetTenantDashboardUrl).toHaveBeenCalledWith(
      expect.objectContaining({ id: "gldf" }),
      "/sign-up",
      "production",
    );
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({
      from: "Scaffold Web <hello@updates.scaffoldweb.com>",
      to: "owner@example.com",
      subject: "You're invited to manage A&B alert(\"x\")",
      html: expect.stringContaining("A&amp;B alert(&quot;x&quot;)"),
      text: expect.stringContaining("Create your account: https://admin.example.com/sign-up"),
    }));
  });
});
