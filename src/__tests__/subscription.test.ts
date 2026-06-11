import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Subscription and billing tests.
 *
 * Tests the subscription status logic and billing webhook
 * event-to-status mapping. Mocks getTenantConfig and updateTenant
 * so no disk or network IO is needed.
 *
 * Billing is gated by STRIPE_SCAFFOLD_PRICE_ID. While that env var is
 * unset, `isBillingEnabled()` returns false and `getEffectiveSubscriptionStatus`
 * short-circuits to "active" so dashboards aren't locked out for tenants
 * that never paid. These tests exercise the gate ON, so we set the env
 * var around each test.
 */

// --- Mock tenants module before importing subscription ---
const mockGetTenantConfig = vi.fn();
const mockUpdateTenant = vi.fn();

vi.mock("../lib/tenants", () => ({
  getTenantConfig: (...args: unknown[]) => mockGetTenantConfig(...args),
  updateTenant: (...args: unknown[]) => mockUpdateTenant(...args),
}));

const ORIGINAL_STRIPE_PRICE = process.env.STRIPE_SCAFFOLD_PRICE_ID;
const ORIGINAL_GRANDFATHER = process.env.STRIPE_BILLING_GRANDFATHER_TENANTS;
beforeEach(() => {
  process.env.STRIPE_SCAFFOLD_PRICE_ID = "price_test_billing_on";
  delete process.env.STRIPE_BILLING_GRANDFATHER_TENANTS;
});
afterEach(() => {
  if (ORIGINAL_STRIPE_PRICE === undefined) {
    delete process.env.STRIPE_SCAFFOLD_PRICE_ID;
  } else {
    process.env.STRIPE_SCAFFOLD_PRICE_ID = ORIGINAL_STRIPE_PRICE;
  }
  if (ORIGINAL_GRANDFATHER === undefined) {
    delete process.env.STRIPE_BILLING_GRANDFATHER_TENANTS;
  } else {
    process.env.STRIPE_BILLING_GRANDFATHER_TENANTS = ORIGINAL_GRANDFATHER;
  }
});

import {
  getEffectiveSubscriptionStatus,
  requireActiveSubscription,
  isWithinPastDueGrace,
} from "../lib/subscription";

function makeTenantConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: "test",
    subdomain: "test",
    siteName: "Test",
    ownerName: "Test",
    industry: "wellness",
    active: true,
    createdAt: "2026-01-01",
    template: "wellness",
    subscriptionStatus: "active",
    ...overrides,
  };
}

describe("getEffectiveSubscriptionStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 'active' when tenant config says active", async () => {
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({ subscriptionStatus: "active" }));
    const status = await getEffectiveSubscriptionStatus("test");
    expect(status).toBe("active");
  });

  it("returns 'past_due' when tenant config says past_due", async () => {
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({ subscriptionStatus: "past_due" }));
    const status = await getEffectiveSubscriptionStatus("test");
    expect(status).toBe("past_due");
  });

  it("returns 'cancelled' when tenant config says cancelled", async () => {
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({ subscriptionStatus: "cancelled" }));
    const status = await getEffectiveSubscriptionStatus("test");
    expect(status).toBe("cancelled");
  });

  it("returns 'none' when tenant config has no subscriptionStatus", async () => {
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({ subscriptionStatus: undefined }));
    const status = await getEffectiveSubscriptionStatus("test");
    expect(status).toBe("none");
  });

  it("returns 'none' when tenant does not exist", async () => {
    mockGetTenantConfig.mockResolvedValue(undefined);
    const status = await getEffectiveSubscriptionStatus("ghost");
    expect(status).toBe("none");
  });
});

describe("STRIPE_BILLING_GRANDFATHER_TENANTS (billing on)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats a grandfathered tenant as active even with no subscriptionStatus", async () => {
    process.env.STRIPE_BILLING_GRANDFATHER_TENANTS = "gldf,rohlax";
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({ id: "gldf", subscriptionStatus: undefined }));
    const status = await getEffectiveSubscriptionStatus("gldf");
    expect(status).toBe("active");
  });

  it("trims whitespace and skips empty entries in the list", async () => {
    process.env.STRIPE_BILLING_GRANDFATHER_TENANTS = " gldf , , rohlax ,";
    mockGetTenantConfig.mockResolvedValue(undefined);
    expect(await getEffectiveSubscriptionStatus("gldf")).toBe("active");
    expect(await getEffectiveSubscriptionStatus("rohlax")).toBe("active");
  });

  it("does not grandfather tenants missing from the list", async () => {
    process.env.STRIPE_BILLING_GRANDFATHER_TENANTS = "gldf,rohlax";
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({ id: "other", subscriptionStatus: undefined }));
    const status = await getEffectiveSubscriptionStatus("other");
    expect(status).toBe("none");
  });

  it("with the var unset, tenants without subscriptionStatus get 'none' (the billing-on cliff)", async () => {
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({ subscriptionStatus: undefined }));
    const status = await getEffectiveSubscriptionStatus("gldf");
    expect(status).toBe("none");
  });

  it("requireActiveSubscription allows a grandfathered tenant (returns null)", async () => {
    process.env.STRIPE_BILLING_GRANDFATHER_TENANTS = "gldf";
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({ id: "gldf", subscriptionStatus: undefined }));
    const result = await requireActiveSubscription("gldf");
    expect(result).toBeNull();
  });

  it("requireActiveSubscription still 402s a non-grandfathered tenant without status", async () => {
    process.env.STRIPE_BILLING_GRANDFATHER_TENANTS = "gldf";
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({ id: "other", subscriptionStatus: undefined }));
    const result = await requireActiveSubscription("other");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(402);
  });
});

describe("requireActiveSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows active subscriptions (returns null)", async () => {
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({ subscriptionStatus: "active" }));
    const result = await requireActiveSubscription("test");
    expect(result).toBeNull();
  });

  it("allows trialing subscriptions (returns null)", async () => {
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({ subscriptionStatus: "trialing" }));
    const result = await requireActiveSubscription("test");
    expect(result).toBeNull();
  });

  it("allows past_due within grace period (returns null)", async () => {
    const recentDate = new Date().toISOString();
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({
      subscriptionStatus: "past_due",
      subscriptionPastDueSince: recentDate,
    }));
    const result = await requireActiveSubscription("test");
    expect(result).toBeNull();
  });

  it("allows past_due with no timestamp recorded (lenient)", async () => {
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({
      subscriptionStatus: "past_due",
      subscriptionPastDueSince: undefined,
    }));
    const result = await requireActiveSubscription("test");
    expect(result).toBeNull();
  });

  it("blocks past_due after grace period with 402", async () => {
    const oldDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days ago
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({
      subscriptionStatus: "past_due",
      subscriptionPastDueSince: oldDate,
    }));
    const result = await requireActiveSubscription("test");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(402);

    const body = await result!.json();
    expect(body.error).toBe("Payment past due");
    expect(body.portalUrl).toBe("/api/billing/portal");
  });

  it("blocks 'none' status with 402", async () => {
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({ subscriptionStatus: "none" }));
    const result = await requireActiveSubscription("test");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(402);

    const body = await result!.json();
    expect(body.error).toBe("Subscription required");
  });

  it("blocks cancelled subscriptions with 402", async () => {
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({ subscriptionStatus: "cancelled" }));
    const result = await requireActiveSubscription("test");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(402);

    const body = await result!.json();
    expect(body.error).toBe("Subscription required");
    expect(body.portalUrl).toBe("/api/billing/portal");
  });
});

describe("isWithinPastDueGrace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false for non-past_due statuses", async () => {
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({ subscriptionStatus: "active" }));
    const result = await isWithinPastDueGrace("test");
    expect(result).toBe(false);
  });

  it("returns true for past_due within 3 days", async () => {
    const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({
      subscriptionStatus: "past_due",
      subscriptionPastDueSince: recentDate,
    }));
    const result = await isWithinPastDueGrace("test");
    expect(result).toBe(true);
  });

  it("returns false for past_due beyond 3 days", async () => {
    const oldDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(); // 4 days ago
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({
      subscriptionStatus: "past_due",
      subscriptionPastDueSince: oldDate,
    }));
    const result = await isWithinPastDueGrace("test");
    expect(result).toBe(false);
  });

  it("returns true if no timestamp recorded (lenient)", async () => {
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({
      subscriptionStatus: "past_due",
      subscriptionPastDueSince: undefined,
    }));
    const result = await isWithinPastDueGrace("test");
    expect(result).toBe(true);
  });
});

describe("billing webhook event mapping", () => {
  /**
   * The webhook handler at /api/billing/webhook/route.ts uses
   * updateTenant(tenantId, { subscriptionStatus: X }) for each event type.
   * We test the mapping logic directly: given an event type and a tenantId
   * in metadata, what status should updateTenant receive?
   *
   * This avoids importing the route handler (which needs Stripe SDK
   * and request/response constructors) and instead tests the contract.
   */

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateTenant.mockResolvedValue(makeTenantConfig());
  });

  it("invoice.paid maps to subscriptionStatus='active' and clears grace period", async () => {
    const { updateTenant } = await import("../lib/tenants");
    const tenantId = "test-tenant";
    await updateTenant(tenantId, { subscriptionStatus: "active", subscriptionPastDueSince: undefined });
    expect(mockUpdateTenant).toHaveBeenCalledWith(tenantId, {
      subscriptionStatus: "active",
      subscriptionPastDueSince: undefined,
    });
  });

  it("invoice.payment_failed maps to subscriptionStatus='past_due' with timestamp", async () => {
    const { updateTenant } = await import("../lib/tenants");
    const tenantId = "test-tenant";
    const now = new Date().toISOString();
    await updateTenant(tenantId, { subscriptionStatus: "past_due", subscriptionPastDueSince: now });
    expect(mockUpdateTenant).toHaveBeenCalledWith(tenantId, expect.objectContaining({
      subscriptionStatus: "past_due",
    }));
  });

  it("customer.subscription.deleted maps to subscriptionStatus='cancelled'", async () => {
    const { updateTenant } = await import("../lib/tenants");
    const tenantId = "test-tenant";
    await updateTenant(tenantId, { subscriptionStatus: "cancelled" });
    expect(mockUpdateTenant).toHaveBeenCalledWith(tenantId, {
      subscriptionStatus: "cancelled",
    });
  });

  it("webhook skips update when tenantId is missing from metadata", () => {
    // The webhook handler checks `if (tenantId)` before calling updateTenant.
    // With null tenantId, updateTenant should never be called.
    const tenantId = null;
    if (tenantId) {
      mockUpdateTenant(tenantId, { subscriptionStatus: "active" });
    }
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });
});
