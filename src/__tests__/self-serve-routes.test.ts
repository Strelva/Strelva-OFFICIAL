import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
const mockCurrentUser = vi.fn();
const mockCreateSelfServeTenant = vi.fn();
const mockCreateTenantSubscriptionCheckout = vi.fn();
const mockVerifyAuth = vi.fn();
const mockRequireTenantPermission = vi.fn();
const mockGetCurrentUserEmail = vi.fn();
const mockGetTenantConfig = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
  currentUser: () => mockCurrentUser(),
}));

vi.mock("@/lib/self-serve", () => ({
  createSelfServeTenant: (...args: unknown[]) => mockCreateSelfServeTenant(...args),
  SelfServeProvisioningError: class SelfServeProvisioningError extends Error {
    constructor(message: string, public status = 400) {
      super(message);
      this.name = "SelfServeProvisioningError";
    }
  },
  normalizeTenantSlug: (value: string) =>
    value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
  validateTenantSlug: (slug: string) => (slug.length >= 3 ? null : "Subdomain must be at least 3 characters."),
}));

vi.mock("@/lib/billing", () => ({
  createTenantSubscriptionCheckout: (...args: unknown[]) => mockCreateTenantSubscriptionCheckout(...args),
  BillingConfigurationError: class BillingConfigurationError extends Error {},
}));

vi.mock("@/lib/auth", () => ({
  verifyAuth: () => mockVerifyAuth(),
  requireTenantPermission: (...args: unknown[]) => mockRequireTenantPermission(...args),
  getCurrentUserEmail: () => mockGetCurrentUserEmail(),
}));

vi.mock("@/lib/tenants", () => ({
  getTenantConfig: (...args: unknown[]) => mockGetTenantConfig(...args),
}));

const tenant = {
  id: "sunrise-yoga",
  subdomain: "sunrise-yoga",
  siteName: "Sunrise Yoga",
  ownerName: "Avery",
  ownerEmail: "avery@example.com",
  industry: "wellness",
  active: true,
  createdAt: "2026-05-08",
  template: "wellness",
  subscriptionStatus: "none",
};

describe("self-serve tenant route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockCurrentUser.mockResolvedValue({
      firstName: "Avery",
      lastName: "Stone",
      emailAddresses: [{ emailAddress: "avery@example.com" }],
    });
    mockCreateSelfServeTenant.mockResolvedValue({
      tenant,
      dashboardUrl: "http://sunrise-yoga.localhost:3000/dashboard?welcome=1",
      publicUrl: "http://sunrise-yoga.localhost:3000",
      seededSections: ["hero", "settings"],
    });
    mockCreateTenantSubscriptionCheckout.mockResolvedValue({
      checkoutUrl: "https://checkout.stripe.com/session",
      stripeCustomerId: "cus_123",
    });
  });

  it("requires an authenticated Clerk user", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { POST } = await import("@/app/api/self-serve/tenant/route");

    const response = await POST(new Request("http://localhost/api/self-serve/tenant", {
      method: "POST",
      body: JSON.stringify({ businessName: "Sunrise Yoga" }),
    }));

    expect(response.status).toBe(401);
  });

  it("creates a tenant and can start checkout in the same call", async () => {
    const { POST } = await import("@/app/api/self-serve/tenant/route");

    const response = await POST(new Request("http://localhost/api/self-serve/tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: "Sunrise Yoga",
        industry: "wellness",
        requestedSlug: "sunrise-yoga",
        startCheckout: true,
      }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      tenantId: "sunrise-yoga",
      checkoutUrl: "https://checkout.stripe.com/session",
    });
    expect(mockCreateSelfServeTenant).toHaveBeenCalledWith(expect.objectContaining({
      businessName: "Sunrise Yoga",
      ownerEmail: "avery@example.com",
      clerkUserId: "user_123",
    }), expect.objectContaining({ userId: "user_123" }));
    expect(mockCreateTenantSubscriptionCheckout).toHaveBeenCalledWith(expect.objectContaining({
      tenant,
      customerEmail: "avery@example.com",
      successUrl: "http://sunrise-yoga.localhost:3000/dashboard?welcome=1",
    }));
  });
});

describe("self-serve checkout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue(true);
    mockRequireTenantPermission.mockResolvedValue(null);
    mockGetTenantConfig.mockResolvedValue(tenant);
    mockGetCurrentUserEmail.mockResolvedValue("avery@example.com");
    mockCreateTenantSubscriptionCheckout.mockResolvedValue({
      checkoutUrl: "https://checkout.stripe.com/session",
      stripeCustomerId: "cus_123",
    });
  });

  it("starts checkout for an owned tenant", async () => {
    const { POST } = await import("@/app/api/self-serve/checkout/route");

    const response = await POST(new Request("http://localhost/api/self-serve/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: "sunrise-yoga" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      checkoutUrl: "https://checkout.stripe.com/session",
      stripeCustomerId: "cus_123",
    });
    expect(mockRequireTenantPermission).toHaveBeenCalledWith("sunrise-yoga", "billing:manage");
  });
});
