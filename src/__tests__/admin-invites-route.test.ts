import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAssignUserToTenant = vi.hoisted(() => vi.fn());
const mockCreateInvite = vi.hoisted(() => vi.fn());
const mockGetCurrentUserEmail = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockGetTenantDashboardUrl = vi.hoisted(() => vi.fn());
const mockGetUserList = vi.hoisted(() => vi.fn());
const mockFindUserIdByEmail = vi.hoisted(() => vi.fn());
const mockRequireTenantPermission = vi.hoisted(() => vi.fn());
const mockSendEmail = vi.hoisted(() => vi.fn());
const mockGetActorContext = vi.hoisted(() => vi.fn());
const mockLogAuditEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  CLIENT_ROLES: ["viewer", "editor", "admin", "owner"],
  assignUserToTenant: mockAssignUserToTenant,
  getCurrentUserEmail: mockGetCurrentUserEmail,
  getActorContext: mockGetActorContext,
  isSuperAdmin: vi.fn(() => Promise.resolve(true)),
  requireTenantPermission: mockRequireTenantPermission,
  findUserIdByEmail: mockFindUserIdByEmail,
}));

vi.mock("@/lib/storage", () => ({
  logAuditEvent: mockLogAuditEvent,
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
    process.env.RESEND_DOMAIN = "updates.strelva.com";
    mockGetTenantConfig.mockResolvedValue({
      id: "gldf",
      siteName: `A&B <script>alert("x")</script>`,
    });
    mockGetTenantDashboardUrl.mockReturnValue("https://admin.greatlakesdriedfruit.com/sign-up");
    mockGetUserList.mockResolvedValue({ data: [] });
    mockFindUserIdByEmail.mockResolvedValue(null);
    mockCreateInvite.mockResolvedValue(true);
    mockGetCurrentUserEmail.mockResolvedValue("admin@example.com");
    mockSendEmail.mockResolvedValue({ data: { id: "email_123" }, error: null, headers: null });
    mockGetActorContext.mockResolvedValue({
      userId: "admin_1",
      email: "admin@example.com",
      type: "super_admin",
      isSuperAdmin: true,
    });
    mockLogAuditEvent.mockResolvedValue(undefined);
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
    const payload = await response.json();
    expect(payload).toMatchObject({
      success: true,
      emailSent: true,
      signUpUrl: "https://admin.greatlakesdriedfruit.com/sign-up?email=owner%40example.com",
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
      from: "Strelva <hello@updates.strelva.com>",
      to: "owner@example.com",
      subject: "You're invited to manage A&B alert(\"x\")",
      html: expect.stringContaining("A&amp;B alert(&quot;x&quot;)"),
      text: expect.stringContaining(
        "Create your account: https://admin.greatlakesdriedfruit.com/sign-up?email=owner%40example.com",
      ),
    }));
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({
      html: expect.stringContaining("owner@example.com"),
      text: expect.stringContaining(
        "Use owner@example.com when signing up so your dashboard access connects automatically.",
      ),
    }));
    expect(mockGetActorContext).toHaveBeenCalledWith("gldf");
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockLogAuditEvent).toHaveBeenCalledWith({
      tenant: "gldf",
      action: "invite.send",
      targetType: "user",
      targetId: "owner@example.com",
      actor: expect.objectContaining({ email: "admin@example.com" }),
      metadata: { role: "owner", emailSent: true },
    });
  });

  it("audits assigning an already-existing user to the tenant", async () => {
    mockFindUserIdByEmail.mockResolvedValue("user_existing");
    mockAssignUserToTenant.mockResolvedValue(true);

    const { POST } = await import("@/app/api/admin/invites/route");

    const response = await POST(new Request("http://localhost/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "Owner@Example.com ", tenant: " gldf ", role: "editor" }),
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ success: true, existingUser: true });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockLogAuditEvent).toHaveBeenCalledWith({
      tenant: "gldf",
      action: "invite.send",
      targetType: "user",
      targetId: "owner@example.com",
      actor: expect.objectContaining({ email: "admin@example.com" }),
      metadata: { role: "editor", emailSent: false },
    });
  });
});
