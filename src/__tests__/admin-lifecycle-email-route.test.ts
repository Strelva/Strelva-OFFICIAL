import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsSuperAdmin = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockGetActorContext = vi.hoisted(() => vi.fn());
const mockLogAuditEvent = vi.hoisted(() => vi.fn());
const mockEmailSendingPaused = vi.hoisted(() => vi.fn());
const mockSendWelcome = vi.hoisted(() => vi.fn());
const mockSendSiteLive = vi.hoisted(() => vi.fn());
const mockSendReviewRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  isSuperAdmin: mockIsSuperAdmin,
  getActorContext: mockGetActorContext,
}));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mockGetTenantConfig }));
vi.mock("@/lib/storage", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/email-enabled", () => ({ emailSendingPaused: mockEmailSendingPaused }));
vi.mock("@/lib/tenant-urls", () => ({
  getTenantDashboardUrl: () => "https://admin.demo.com/dashboard",
}));
vi.mock("@/lib/delivery-email", () => ({
  sendWelcomeEmail: mockSendWelcome,
  sendSiteLiveEmail: mockSendSiteLive,
  sendReviewRequestEmail: mockSendReviewRequest,
}));

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function post(body: unknown) {
  return new Request("http://x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const TENANT = {
  id: "demo",
  siteName: "Demo Co",
  ownerName: "Sam",
  ownerEmail: "sam@example.com",
  siteUrl: "https://democo.com",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSuperAdmin.mockResolvedValue(true);
  mockGetTenantConfig.mockResolvedValue({ ...TENANT });
  mockGetActorContext.mockResolvedValue({ email: "op@strelva.com", isSuperAdmin: true });
  mockLogAuditEvent.mockResolvedValue(undefined);
  mockEmailSendingPaused.mockReturnValue(false);
  mockSendWelcome.mockResolvedValue(true);
  mockSendSiteLive.mockResolvedValue(true);
  mockSendReviewRequest.mockResolvedValue(true);
});

describe("POST /api/admin/tenants/[id]/lifecycle-email", () => {
  it("403s a non-super-admin", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const { POST } = await import("@/app/api/admin/tenants/[id]/lifecycle-email/route");
    const res = await POST(post({ type: "welcome" }), params("demo"));
    expect(res.status).toBe(403);
    expect(mockSendWelcome).not.toHaveBeenCalled();
  });

  it("404s an unknown tenant", async () => {
    mockGetTenantConfig.mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/tenants/[id]/lifecycle-email/route");
    const res = await POST(post({ type: "welcome" }), params("nope"));
    expect(res.status).toBe(404);
  });

  it("400s an unknown type", async () => {
    const { POST } = await import("@/app/api/admin/tenants/[id]/lifecycle-email/route");
    const res = await POST(post({ type: "bogus" }), params("demo"));
    expect(res.status).toBe(400);
  });

  it("sends the welcome email and audit-logs the send", async () => {
    const { POST } = await import("@/app/api/admin/tenants/[id]/lifecycle-email/route");
    const res = await POST(post({ type: "welcome" }), params("demo"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
    expect(mockSendWelcome).toHaveBeenCalledWith({
      email: "sam@example.com",
      businessName: "Demo Co",
      ownerName: "Sam",
      dashboardUrl: "https://admin.demo.com/dashboard",
      tenantId: "demo",
    });
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant: "demo",
        action: "lifecycle-email.send",
        metadata: { type: "welcome", sent: true },
      }),
    );
  });

  it("sends the site-live email with the tenant siteUrl", async () => {
    const { POST } = await import("@/app/api/admin/tenants/[id]/lifecycle-email/route");
    const res = await POST(post({ type: "site-live" }), params("demo"));
    expect(res.status).toBe(200);
    expect(mockSendSiteLive).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: "https://democo.com" }),
    );
  });

  it("sends the review-request email with the body reviewUrl", async () => {
    const { POST } = await import("@/app/api/admin/tenants/[id]/lifecycle-email/route");
    const res = await POST(
      post({ type: "review-request", reviewUrl: "https://g.page/r/demo/review" }),
      params("demo"),
    );
    expect(res.status).toBe(200);
    expect(mockSendReviewRequest).toHaveBeenCalledWith(
      expect.objectContaining({ reviewUrl: "https://g.page/r/demo/review" }),
    );
  });

  it("400s when the tenant has no owner email", async () => {
    mockGetTenantConfig.mockResolvedValue({ ...TENANT, ownerEmail: undefined });
    const { POST } = await import("@/app/api/admin/tenants/[id]/lifecycle-email/route");
    const res = await POST(post({ type: "welcome" }), params("demo"));
    expect(res.status).toBe(400);
    expect(mockSendWelcome).not.toHaveBeenCalled();
  });

  it("400s site-live when the tenant has no siteUrl", async () => {
    mockGetTenantConfig.mockResolvedValue({ ...TENANT, siteUrl: undefined });
    const { POST } = await import("@/app/api/admin/tenants/[id]/lifecycle-email/route");
    const res = await POST(post({ type: "site-live" }), params("demo"));
    expect(res.status).toBe(400);
    expect(mockSendSiteLive).not.toHaveBeenCalled();
  });

  it("400s review-request when reviewUrl is absent", async () => {
    const { POST } = await import("@/app/api/admin/tenants/[id]/lifecycle-email/route");
    const res = await POST(post({ type: "review-request" }), params("demo"));
    expect(res.status).toBe(400);
    expect(mockSendReviewRequest).not.toHaveBeenCalled();
  });

  it("returns { sent: false, paused: true } when email is paused", async () => {
    mockSendWelcome.mockResolvedValue(false);
    mockEmailSendingPaused.mockReturnValue(true);
    const { POST } = await import("@/app/api/admin/tenants/[id]/lifecycle-email/route");
    const res = await POST(post({ type: "welcome" }), params("demo"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: false, paused: true });
    // A paused send is an off-switch, not an action to audit.
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });
});
