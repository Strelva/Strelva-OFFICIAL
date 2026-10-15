vi.mock("@/platform/infra/email/business-context", () => ({ resolveEmailBusinessContext: async ({ tenantId }: { tenantId?: string }) => ({ workspaceId: null, tenantIds: [tenantId], ownerAuthorship: null, businessName: null, replyTo: null, timeZone: null }) }));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: async () => "inherit" }));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/invites/route";
vi.mock("@/platform/agency-brand/server", () => ({
  resolveTenantBrand: async () => ({ agencyId: "agency-fixture", name: "North Studio", logoUrl: "https://example.test/logo.png", accentColor: "#447a4f", replyTo: "team@north.example", credit: "runs_on_strelva" }),
  resolveOwnerBrand: async () => ({ agencyId: "agency-fixture", name: "North Studio", logoUrl: "https://example.test/logo.png", accentColor: "#447a4f", replyTo: "team@north.example", credit: "runs_on_strelva" }),
  resolveAgencyEmailIdentity: async () => ({ name: "North Studio", replyTo: "team@north.example" }),
}));

const identityError = vi.hoisted(() => vi.fn());
const staffRecord = vi.hoisted(() => vi.fn());
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ from: (table: string) => {
  const query = { select: () => query, eq: () => query, is: () => query, maybeSingle: async () => table === "users" ? { data: (await mockFindUserIdByEmail()) ? { id: await mockFindUserIdByEmail() } : null, error: identityError() } : { data: staffRecord(), error: identityError() } };
  return query;
} }) }));

const mockAssignUserToTenant = vi.hoisted(() => vi.fn());
const mockCreateInvite = vi.hoisted(() => vi.fn());
const mockGetCurrentUserEmail = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockGetTenantDashboardUrl = vi.hoisted(() => vi.fn());
const mockFindUserIdByEmail = vi.hoisted(() => vi.fn());
const mockRequireTenantPermission = vi.hoisted(() => vi.fn());
const mockSendEmail = vi.hoisted(() => vi.fn());
const mockGetActorContext = vi.hoisted(() => vi.fn());
const mockLogAuditEvent = vi.hoisted(() => vi.fn());

vi.mock("@/platform/infra/auth", () => ({
  CLIENT_ROLES: ["viewer", "editor", "admin", "owner"],
  assignUserToTenant: mockAssignUserToTenant,
  getCurrentUserEmail: mockGetCurrentUserEmail,
  getActorContext: mockGetActorContext,
  isSuperAdmin: vi.fn(() => Promise.resolve(true)),
  requireTenantPermission: mockRequireTenantPermission,
  findUserIdByEmail: mockFindUserIdByEmail,
}));

const mockWorkspaceForTenant = vi.hoisted(() => vi.fn());
const mockOwnerContext = vi.hoisted(() => vi.fn());
const mockIssue = vi.hoisted(() => vi.fn());
vi.mock("@/platform/release-flags/store", () => ({ releaseWorkspaceForTenant: mockWorkspaceForTenant }));
vi.mock("@/platform/owner-entry/operator-invitations", async importOriginal => ({ ...(await importOriginal<typeof import("@/platform/owner-entry/operator-invitations")>()), operatorOwnerInvitationContext: mockOwnerContext }));
vi.mock("@/platform/workspaces/invitations", () => ({ issueWorkspaceInvitation: mockIssue }));

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
    identityError.mockReturnValue(null);
    staffRecord.mockReturnValue(null);
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_DOMAIN = "updates.strelva.com";
    mockGetTenantConfig.mockResolvedValue({
      id: "gldf",
      siteName: `A&B <script>alert("x")</script>`,
    });
    mockGetTenantDashboardUrl.mockReturnValue("https://admin.greatlakesdriedfruit.com/sign-up");
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

    const response = await POST(new Request("http://localhost/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "Owner@Example.com ", tenant: " gldf ", reason: "Owner requested access" }),
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
      from: '"North Studio" <hello@updates.strelva.com>',
      to: "owner@example.com",
      subject: "You're invited to manage A&B alert(\"x\")",
      html: expect.stringContaining("A&amp;B alert(&quot;x&quot;)"),
      text: expect.stringContaining(
        "Set up your login: https://admin.greatlakesdriedfruit.com/sign-up?email=owner%40example.com",
      ),
    }));
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({
      html: expect.stringContaining("owner@example.com"),
      text: expect.stringContaining(
        "Use owner@example.com when signing up so your workspace access connects automatically.",
      ),
    }));
    expect(mockGetActorContext).toHaveBeenCalledWith("gldf");
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(2);
    expect(mockLogAuditEvent).toHaveBeenCalledWith({
      tenant: "gldf",
      action: "invite.send",
      targetType: "user",
      targetId: "owner@example.com",
      actor: expect.objectContaining({ email: "admin@example.com" }),
      metadata: { role: "owner", emailSent: true, reason: "Owner requested access" },
    });
  });

  it("rejects self invitations before creating a pending grant", async () => {
    const response = await POST(new Request("http://localhost/api/admin/invites", { method: "POST", body: JSON.stringify({ email: "admin@example.com", tenant: "gldf" }) }));
    expect(response.status).toBe(403);
    expect(mockCreateInvite).not.toHaveBeenCalled();
    expect(mockAssignUserToTenant).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
  it.each(["owner", "admin", "editor"])("rejects known staff %s grants", async role => {
    mockFindUserIdByEmail.mockResolvedValue("staff_other");
    staffRecord.mockReturnValue({ user_id: "staff_other" });
    const response = await POST(new Request("http://localhost/api/admin/invites", { method: "POST", body: JSON.stringify({ email: "staff@example.com", tenant: "gldf", role, reason: "Requested access" }) }));
    expect(response.status).toBe(403);
    expect(mockCreateInvite).not.toHaveBeenCalled();
    expect(mockAssignUserToTenant).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
  it("fails closed on an unreadable account instead of creating an owner invitation", async () => {
    identityError.mockReturnValue(new Error("private db details"));
    const response = await POST(new Request("http://localhost/api/admin/invites", { method: "POST", body: JSON.stringify({ email: "owner@example.com", tenant: "gldf" }) }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
    expect(mockCreateInvite).not.toHaveBeenCalled();
    expect(mockAssignUserToTenant).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
  it("requires a reason before creating a pending owner invitation", async () => {
    const response = await POST(new Request("http://localhost/api/admin/invites", { method: "POST", body: JSON.stringify({ email: "new@example.com", tenant: "gldf" }) }));
    expect(response.status).toBe(400);
    expect(mockCreateInvite).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
  it("requires a reason to assign an existing ordinary account", async () => {
    mockFindUserIdByEmail.mockResolvedValue("customer");
    const response = await POST(new Request("http://localhost/api/admin/invites", { method: "POST", body: JSON.stringify({ email: "owner@example.com", tenant: "gldf" }) }));
    expect(response.status).toBe(400);
    expect(mockAssignUserToTenant).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
  it("refuses assignment when its pre-grant audit cannot persist", async () => {
    mockFindUserIdByEmail.mockResolvedValue("customer");
    mockLogAuditEvent.mockRejectedValueOnce(new Error("unavailable"));
    const response = await POST(new Request("http://localhost/api/admin/invites", { method: "POST", body: JSON.stringify({ email: "owner@example.com", tenant: "gldf", reason: "Requested access" }) }));
    expect(response.status).toBe(503);
    expect(mockAssignUserToTenant).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("audits assigning an already-existing user to the tenant", async () => {
    mockFindUserIdByEmail.mockResolvedValue("user_existing");
    mockAssignUserToTenant.mockResolvedValue(true);


    const response = await POST(new Request("http://localhost/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "Owner@Example.com ", tenant: " gldf ", role: "editor", reason: "Owner requested editor access" }),
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ success: true, existingUser: true });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(2);
    expect(mockLogAuditEvent).toHaveBeenCalledWith({
      tenant: "gldf",
      action: "invite.send",
      targetType: "user",
      targetId: "owner@example.com",
      actor: expect.objectContaining({ email: "admin@example.com" }),
      metadata: { role: "editor", emailSent: false, reason: "Owner requested editor access" },
    });
  });
});

describe("admin invites route with STRELVA_ONE_INVITATION_PATH", () => {
  const originalEnv = { ...process.env };
  const post = (over: Record<string, unknown> = {}) => POST(new Request("http://localhost/api/admin/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@example.com", tenant: "gldf", reason: "Owner requested access", ...over }),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    identityError.mockReturnValue(null);
    staffRecord.mockReturnValue(null);
    process.env.STRELVA_ONE_INVITATION_PATH = "1";
    process.env.RESEND_API_KEY = "";
    mockGetTenantConfig.mockResolvedValue({ id: "gldf", siteName: "GLDF" });
    mockGetTenantDashboardUrl.mockReturnValue("https://admin.example.test/sign-up");
    mockFindUserIdByEmail.mockResolvedValue(null);
    mockCreateInvite.mockResolvedValue(true);
    mockGetCurrentUserEmail.mockResolvedValue("admin@example.com");
    mockGetActorContext.mockResolvedValue({ userId: "admin_1", email: "admin@example.com", type: "super_admin", isSuperAdmin: true });
    mockLogAuditEvent.mockResolvedValue(undefined);
    mockWorkspaceForTenant.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    mockOwnerContext.mockResolvedValue({ actor: { userId: "33333333-3333-4333-8333-333333333333", verifiedEmail: "admin@example.com" }, authTime: 100, state: { workspaceId: "11111111-1111-4111-8111-111111111111" } });
    mockIssue.mockResolvedValue({ invitation: { id: "inv-1" }, acceptUrl: "https://app.example.test/workspace/invitations/accept/tok", delivery: { status: "not_sent", reason: "release_off" } });
  });
  afterEach(() => { process.env = { ...originalEnv }; });

  it("refuses a non-owner role on a converted business and grants nothing", async () => {
    const response = await post({ role: "editor" });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("Strelva operators only invite the owner");
    expect(mockAssignUserToTenant).not.toHaveBeenCalled();
    expect(mockCreateInvite).not.toHaveBeenCalled();
    expect(mockIssue).not.toHaveBeenCalled();
  });

  it("invites a converted business's owner through the one path and returns the link, not an email", async () => {
    process.env.STRELVA_OWNER_INVITATIONS_RELEASE = "1";
    process.env.STRELVA_OWNER_ENTRY = "1";
    process.env.STRELVA_WORKSPACE_RELEASE = "1";
    const response = await post({ role: "owner" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, workspaceInvitation: true, delivery: { status: "not_sent" }, acceptUrl: "https://app.example.test/workspace/invitations/accept/tok" });
    expect(mockIssue).toHaveBeenCalledWith(expect.objectContaining({ role: "owner", recipientEmail: "owner@example.com", issuer: expect.objectContaining({ kind: "operator", authTime: 100 }) }));
    expect(mockAssignUserToTenant).not.toHaveBeenCalled();
    expect(mockCreateInvite).not.toHaveBeenCalled();
  });

  it("refuses an owner invitation while owner invitations are not released", async () => {
    delete process.env.STRELVA_OWNER_INVITATIONS_RELEASE;
    const response = await post({ role: "owner" });
    expect(response.status).toBe(409);
    expect(mockIssue).not.toHaveBeenCalled();
  });

  it("an unconverted tenant keeps the legacy path and says so", async () => {
    mockWorkspaceForTenant.mockResolvedValue(null);
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, legacy: true });
    expect(mockCreateInvite).toHaveBeenCalled();
    expect(mockIssue).not.toHaveBeenCalled();
  });

  it("flag off leaves the legacy response untouched", async () => {
    delete process.env.STRELVA_ONE_INVITATION_PATH;
    const response = await post();
    expect(await response.json()).not.toHaveProperty("legacy");
    expect(mockWorkspaceForTenant).not.toHaveBeenCalled();
  });
});
