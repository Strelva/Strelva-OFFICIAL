import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantConfig } from "@/lib/types";

const mockGetAllTenants = vi.fn();
const mockCreateTenant = vi.fn();
const mockUpdateTenant = vi.fn();
const mockAssignUserToTenant = vi.fn();
const mockSetContent = vi.fn();
const mockSetPageConfig = vi.fn();
const mockLogAuditEvent = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();
const mockStripeCustomerCreate = vi.fn();
const mockStripeCheckoutCreate = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(() => ({
    set: mockRedisSet,
    del: mockRedisDel,
  })),
}));

vi.mock("@/lib/tenants", () => ({
  getAllTenants: (...args: unknown[]) => mockGetAllTenants(...args),
  createTenant: (...args: unknown[]) => mockCreateTenant(...args),
  updateTenant: (...args: unknown[]) => mockUpdateTenant(...args),
}));

vi.mock("@/lib/auth", () => ({
  assignUserToTenant: (...args: unknown[]) => mockAssignUserToTenant(...args),
}));

vi.mock("@/lib/storage", () => ({
  setContent: (...args: unknown[]) => mockSetContent(...args),
  setPageConfig: (...args: unknown[]) => mockSetPageConfig(...args),
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
}));

vi.mock("stripe", () => ({
  default: vi.fn(function Stripe() {
    return {
      customers: { create: mockStripeCustomerCreate },
      checkout: { sessions: { create: mockStripeCheckoutCreate } },
    };
  }),
}));

function makeTenant(overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    id: "sunrise-yoga",
    subdomain: "sunrise-yoga",
    siteName: "Sunrise Yoga",
    ownerName: "Avery",
    ownerEmail: "avery@example.com",
    industry: "wellness",
    active: true,
    lifecycleStatus: "active",
    createdAt: "2026-05-08",
    template: "wellness",
    subscriptionStatus: "none",
    ...overrides,
  } as TenantConfig;
}

describe("self-serve provisioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllTenants.mockResolvedValue([]);
    mockCreateTenant.mockImplementation(async (config) =>
      makeTenant({
        id: config.subdomain,
        subdomain: config.subdomain,
        siteName: config.siteName,
        ownerName: config.ownerName,
        ownerEmail: config.ownerEmail,
        industry: config.industry,
        template: config.template,
        siteUrl: config.siteUrl,
        revalidateUrl: config.revalidateUrl,
        revalidationSecret: config.revalidationSecret,
      }),
    );
    mockAssignUserToTenant.mockResolvedValue(true);
    mockSetContent.mockResolvedValue(undefined);
    mockSetPageConfig.mockResolvedValue(undefined);
    mockLogAuditEvent.mockResolvedValue(undefined);
    mockRedisSet.mockResolvedValue("OK");
    mockRedisDel.mockResolvedValue(1);
  });

  it("normalizes tenant slugs into safe subdomains", async () => {
    const { normalizeTenantSlug, validateTenantSlug } = await import("@/lib/self-serve");

    expect(normalizeTenantSlug("  Sunrise Yoga & Wellness!  ")).toBe("sunrise-yoga-and-wellness");
    expect(validateTenantSlug("sunrise-yoga")).toBeNull();
    expect(validateTenantSlug("admin")).toContain("reserved");
  });

  it("finds an available suffixed slug when the base is taken", async () => {
    mockGetAllTenants.mockResolvedValue([makeTenant({ id: "sunrise-yoga" })]);
    const { getAvailableSelfServeSlug } = await import("@/lib/self-serve");

    await expect(getAvailableSelfServeSlug("Sunrise Yoga")).resolves.toBe("sunrise-yoga-2");
  });

  it("creates a tenant, assigns the Clerk owner, and seeds starter content", async () => {
    const { createSelfServeTenant, SELF_SERVE_CONTENT_SECTIONS } = await import("@/lib/self-serve");

    const result = await createSelfServeTenant(
      {
        businessName: "Sunrise Yoga",
        ownerName: "Avery",
        ownerEmail: "avery@example.com",
        clerkUserId: "user_123",
        industry: "wellness",
        description: "A neighborhood yoga studio.",
        location: "Buffalo, NY",
        bookingUrl: "https://example.com/book",
      },
      {
        userId: "user_123",
        email: "avery@example.com",
        type: "user",
        isSuperAdmin: false,
      },
    );

    expect(result.tenant.id).toBe("sunrise-yoga");
    expect(result.dashboardUrl).toContain("/dashboard?welcome=1");
    expect(mockCreateTenant).toHaveBeenCalledWith(expect.objectContaining({
      subdomain: "sunrise-yoga",
      ownerEmail: "avery@example.com",
      template: "wellness",
      autoPublish: false,
    }));
    expect(mockAssignUserToTenant).toHaveBeenCalledWith("user_123", "sunrise-yoga", "owner");
    expect(mockSetContent).toHaveBeenCalledTimes(SELF_SERVE_CONTENT_SECTIONS.length);
    expect(mockSetContent).toHaveBeenCalledWith("settings", expect.objectContaining({
      siteName: "Sunrise Yoga",
      bookingUrl: "https://example.com/book",
    }), "sunrise-yoga");
    expect(mockSetPageConfig).toHaveBeenCalledWith(expect.any(Object), "sunrise-yoga");
    expect(mockLogAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "self_serve.tenant_created",
      tenant: "sunrise-yoga",
    }));
  });
});

describe("tenant subscription checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_example";
    process.env.STRIPE_SCAFFOLD_PRICE_ID = "price_example";
    mockUpdateTenant.mockResolvedValue(makeTenant({ stripeCustomerId: "cus_123" }));
    mockStripeCustomerCreate.mockResolvedValue({ id: "cus_123" });
    mockStripeCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session" });
  });

  it("creates a Stripe customer and checkout session with tenant metadata", async () => {
    const { createTenantSubscriptionCheckout } = await import("@/lib/billing");

    const checkout = await createTenantSubscriptionCheckout({
      tenant: makeTenant({ stripeCustomerId: undefined }),
      customerEmail: "avery@example.com",
      customerName: "Avery",
      successUrl: "https://strelva.com/success",
      cancelUrl: "https://strelva.com/cancel",
    });

    expect(checkout.checkoutUrl).toBe("https://checkout.stripe.com/session");
    expect(mockStripeCustomerCreate).toHaveBeenCalledWith(expect.objectContaining({
      email: "avery@example.com",
      metadata: { tenantId: "sunrise-yoga" },
    }));
    expect(mockUpdateTenant).toHaveBeenCalledWith("sunrise-yoga", { stripeCustomerId: "cus_123" });
    expect(mockStripeCheckoutCreate).toHaveBeenCalledWith(expect.objectContaining({
      customer: "cus_123",
      client_reference_id: "sunrise-yoga",
      metadata: { tenantId: "sunrise-yoga" },
      subscription_data: { metadata: { tenantId: "sunrise-yoga" } },
    }));
  });
});
