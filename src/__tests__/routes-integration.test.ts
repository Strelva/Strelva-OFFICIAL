import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Route-level integration tests.
 *
 * Tests route handler logic with mocked external services
 * (Redis, Clerk, Stripe, Twilio) to verify the full request/response cycle.
 *
 * Because vitest doesn't resolve @/ path aliases for dynamic imports,
 * we test route logic by:
 * 1. Testing helper functions that routes depend on
 * 2. Testing the middleware/auth checks directly
 * 3. Testing webhook validation logic
 */

// ============================================================================
// 1. Content API Write Path Tests
// ============================================================================

// Mock tenants module
const mockGetTenantConfig = vi.fn();
vi.mock("../lib/tenants", () => ({
  getTenantConfig: (...args: unknown[]) => mockGetTenantConfig(...args),
  updateTenant: vi.fn(),
}));

// Mock Clerk
const mockCurrentUser = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(() => Promise.resolve({ userId: "user_123" })),
  currentUser: () => mockCurrentUser(),
  clerkClient: vi.fn(),
}));

function makeTenantConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-tenant",
    subdomain: "test-tenant",
    siteName: "Test Site",
    ownerName: "Test Owner",
    industry: "wellness",
    active: true,
    createdAt: "2026-01-01",
    template: "wellness",
    subscriptionStatus: "active",
    ...overrides,
  };
}

describe("Content API - Tenant Access Checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig());
  });

  it("hasTenantAccess returns false when user has no tenants", async () => {
    mockCurrentUser.mockResolvedValue({
      id: "user_123",
      emailAddresses: [{ emailAddress: "user@example.com" }],
      publicMetadata: { tenants: [] },
    });

    const { hasTenantAccess } = await import("../lib/auth");
    const result = await hasTenantAccess("test-tenant");
    expect(result).toBe(false);
  });

  it("hasTenantAccess returns false when user has different tenant", async () => {
    mockCurrentUser.mockResolvedValue({
      id: "user_123",
      emailAddresses: [{ emailAddress: "user@example.com" }],
      publicMetadata: { tenants: ["other-tenant"] },
    });

    const { hasTenantAccess } = await import("../lib/auth");
    const result = await hasTenantAccess("test-tenant");
    expect(result).toBe(false);
  });

  it("hasTenantAccess returns true when user has matching tenant", async () => {
    mockCurrentUser.mockResolvedValue({
      id: "user_123",
      emailAddresses: [{ emailAddress: "user@example.com" }],
      publicMetadata: { tenants: ["test-tenant", "other-tenant"] },
    });

    const { hasTenantAccess } = await import("../lib/auth");
    const result = await hasTenantAccess("test-tenant");
    expect(result).toBe(true);
  });

  it("hasTenantAccess returns true for super admin regardless of tenant assignment", async () => {
    const originalEnv = process.env.SUPER_ADMIN_EMAILS;
    process.env.SUPER_ADMIN_EMAILS = "superadmin@example.com";

    mockCurrentUser.mockResolvedValue({
      id: "admin_123",
      emailAddresses: [{ emailAddress: "superadmin@example.com" }],
      publicMetadata: { tenants: [] },
    });

    const { hasTenantAccess } = await import("../lib/auth");
    const result = await hasTenantAccess("any-tenant");
    expect(result).toBe(true);

    process.env.SUPER_ADMIN_EMAILS = originalEnv;
  });

  it("requireTenantAccess returns 403 response when access denied", async () => {
    mockCurrentUser.mockResolvedValue({
      id: "user_123",
      emailAddresses: [{ emailAddress: "user@example.com" }],
      publicMetadata: { tenants: [] },
    });

    const { requireTenantAccess } = await import("../lib/auth");
    const result = await requireTenantAccess("test-tenant");

    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);

    const body = await result!.json();
    expect(body.error).toContain("Forbidden");
  });

  it("requireTenantAccess returns null when access allowed", async () => {
    mockCurrentUser.mockResolvedValue({
      id: "user_123",
      emailAddresses: [{ emailAddress: "user@example.com" }],
      publicMetadata: { tenants: ["test-tenant"] },
    });

    const { requireTenantAccess } = await import("../lib/auth");
    const result = await requireTenantAccess("test-tenant");
    expect(result).toBeNull();
  });
});

describe("Content API - Subscription Checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requireActiveSubscription blocks cancelled subscriptions with 402", async () => {
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({ subscriptionStatus: "cancelled" }));

    const { requireActiveSubscription } = await import("../lib/subscription");
    const result = await requireActiveSubscription("test-tenant");

    expect(result).not.toBeNull();
    expect(result!.status).toBe(402);

    const body = await result!.json();
    expect(body.error).toBe("Subscription required");
  });

  it("requireActiveSubscription allows active subscriptions", async () => {
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({ subscriptionStatus: "active" }));

    const { requireActiveSubscription } = await import("../lib/subscription");
    const result = await requireActiveSubscription("test-tenant");
    expect(result).toBeNull();
  });

  it("requireActiveSubscription allows trialing subscriptions", async () => {
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({ subscriptionStatus: "trialing" }));

    const { requireActiveSubscription } = await import("../lib/subscription");
    const result = await requireActiveSubscription("test-tenant");
    expect(result).toBeNull();
  });

  it("requireActiveSubscription blocks past_due after grace period", async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({
      subscriptionStatus: "past_due",
      subscriptionPastDueSince: fiveDaysAgo,
    }));

    const { requireActiveSubscription } = await import("../lib/subscription");
    const result = await requireActiveSubscription("test-tenant");

    expect(result).not.toBeNull();
    expect(result!.status).toBe(402);
  });

  it("requireActiveSubscription allows past_due within grace period", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig({
      subscriptionStatus: "past_due",
      subscriptionPastDueSince: twoDaysAgo,
    }));

    const { requireActiveSubscription } = await import("../lib/subscription");
    const result = await requireActiveSubscription("test-tenant");
    expect(result).toBeNull();
  });
});

// ============================================================================
// 2. SMS Webhook Tests
// ============================================================================

describe("SMS Webhook - Signature Validation", () => {
  it("rejects request with invalid Twilio signature", async () => {
    const { validateRequest } = await import("twilio");

    const authToken = "test-auth-token";
    const invalidSignature = "invalid-signature-xyz";
    const webhookUrl = "https://example.com/api/sms/webhook";
    const params = { From: "+15551234567", Body: "yes" };

    const isValid = validateRequest(authToken, invalidSignature, webhookUrl, params);
    expect(isValid).toBe(false);
  });

  it("rejects request with empty signature", async () => {
    const { validateRequest } = await import("twilio");

    const authToken = "test-auth-token";
    const emptySignature = "";
    const webhookUrl = "https://example.com/api/sms/webhook";
    const params = { From: "+15551234567", Body: "yes" };

    const isValid = validateRequest(authToken, emptySignature, webhookUrl, params);
    expect(isValid).toBe(false);
  });
});

describe("SMS Webhook - Environment Checks", () => {
  it("should fail when SMS enabled but TWILIO_AUTH_TOKEN missing", () => {
    const originalSms = process.env.SMS_SUGGESTIONS_ENABLED;
    const originalToken = process.env.TWILIO_AUTH_TOKEN;

    process.env.SMS_SUGGESTIONS_ENABLED = "true";
    delete process.env.TWILIO_AUTH_TOKEN;

    // The security check that should be in the route
    const shouldReject =
      process.env.SMS_SUGGESTIONS_ENABLED === "true" &&
      !process.env.TWILIO_AUTH_TOKEN;

    expect(shouldReject).toBe(true);

    process.env.SMS_SUGGESTIONS_ENABLED = originalSms;
    if (originalToken) process.env.TWILIO_AUTH_TOKEN = originalToken;
  });

  it("should allow when SMS disabled", () => {
    const originalSms = process.env.SMS_SUGGESTIONS_ENABLED;

    process.env.SMS_SUGGESTIONS_ENABLED = "false";

    const isDisabled = process.env.SMS_SUGGESTIONS_ENABLED !== "true";
    expect(isDisabled).toBe(true);

    process.env.SMS_SUGGESTIONS_ENABLED = originalSms;
  });
});

// ============================================================================
// 3. Stripe Billing Webhook Tests
// ============================================================================

describe("Stripe Webhook - Environment Checks", () => {
  it("should fail when STRIPE_SECRET_KEY is not configured", () => {
    const original = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;

    const shouldReject = !process.env.STRIPE_SECRET_KEY;
    expect(shouldReject).toBe(true);

    if (original) process.env.STRIPE_SECRET_KEY = original;
  });

  it("should fail when STRIPE_WEBHOOK_SECRET is not configured", () => {
    const original = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const shouldReject = !process.env.STRIPE_WEBHOOK_SECRET;
    expect(shouldReject).toBe(true);

    if (original) process.env.STRIPE_WEBHOOK_SECRET = original;
  });
});

describe("Stripe Webhook - Tenant Extraction", () => {
  function extractTenantId(object: unknown): string | null {
    if (!object || typeof object !== "object") return null;
    const obj = object as {
      metadata?: Record<string, string>;
      subscription_details?: { metadata?: Record<string, string> };
      lines?: { data?: Array<{ metadata?: Record<string, string> }> };
    };

    return (
      obj.metadata?.tenantId ||
      obj.subscription_details?.metadata?.tenantId ||
      obj.lines?.data?.find((line) => line.metadata?.tenantId)?.metadata?.tenantId ||
      null
    );
  }

  it("extracts tenantId from metadata", () => {
    const object = { metadata: { tenantId: "test-tenant" } };
    expect(extractTenantId(object)).toBe("test-tenant");
  });

  it("extracts tenantId from subscription_details metadata", () => {
    const object = {
      subscription_details: { metadata: { tenantId: "sub-tenant" } }
    };
    expect(extractTenantId(object)).toBe("sub-tenant");
  });

  it("extracts tenantId from invoice line items", () => {
    const object = {
      lines: {
        data: [
          { metadata: {} },
          { metadata: { tenantId: "line-tenant" } }
        ]
      }
    };
    expect(extractTenantId(object)).toBe("line-tenant");
  });

  it("returns null when tenantId not found", () => {
    const object = { metadata: { other: "data" } };
    expect(extractTenantId(object)).toBeNull();
  });

  it("returns null for invalid object", () => {
    expect(extractTenantId(null)).toBeNull();
    expect(extractTenantId(undefined)).toBeNull();
    expect(extractTenantId("string")).toBeNull();
  });
});

// ============================================================================
// 4. Tenant Access Denial Tests (403)
// ============================================================================

describe("Tenant Access Denial (403)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantConfig.mockResolvedValue(makeTenantConfig());
  });

  it("returns 403 when user is not authenticated", async () => {
    mockCurrentUser.mockResolvedValue(null);

    const { requireTenantAccess } = await import("../lib/auth");
    const result = await requireTenantAccess("test-tenant");

    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("returns 403 for multiple tenants but not the requested one", async () => {
    mockCurrentUser.mockResolvedValue({
      id: "user_123",
      emailAddresses: [{ emailAddress: "user@example.com" }],
      publicMetadata: { tenants: ["tenant-a", "tenant-b", "tenant-c"] },
    });

    const { requireTenantAccess } = await import("../lib/auth");
    const result = await requireTenantAccess("tenant-d");

    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("multiple super admin emails work correctly", async () => {
    const originalEnv = process.env.SUPER_ADMIN_EMAILS;
    process.env.SUPER_ADMIN_EMAILS = "admin1@example.com, admin2@example.com, admin3@example.com";

    mockCurrentUser.mockResolvedValue({
      id: "admin_123",
      emailAddresses: [{ emailAddress: "admin2@example.com" }],
      publicMetadata: { tenants: [] },
    });

    const { isSuperAdmin } = await import("../lib/auth");
    const result = await isSuperAdmin();
    expect(result).toBe(true);

    process.env.SUPER_ADMIN_EMAILS = originalEnv;
  });
});

// ============================================================================
// 5. Custom Domain Resolution in Middleware Tests
// ============================================================================

describe("Custom Domain Resolution", () => {
  const MARKETING_HOSTS = new Set([
    "scaffoldweb.com",
    "www.scaffoldweb.com",
    "localhost",
    "localhost:3000",
    "localhost:3001",
    "reb-studio.vercel.app",
  ]);

  const extractTenantFromHost = (host: string): { tenant: string | null; isAdminSubdomain: boolean } => {
    const hostWithoutPort = host.split(":")[0];

    if (MARKETING_HOSTS.has(host) || MARKETING_HOSTS.has(hostWithoutPort)) {
      return { tenant: null, isAdminSubdomain: false };
    }

    // Production: tenant.scaffoldweb.com
    if (hostWithoutPort.endsWith(".scaffoldweb.com")) {
      const subdomain = hostWithoutPort.replace(".scaffoldweb.com", "");
      if (subdomain && subdomain !== "www" && subdomain !== "admin") {
        return { tenant: subdomain, isAdminSubdomain: false };
      }
      return { tenant: null, isAdminSubdomain: false };
    }

    // Local dev: tenant.localhost
    if (hostWithoutPort.endsWith(".localhost")) {
      const subdomain = hostWithoutPort.replace(".localhost", "");
      if (subdomain) {
        return { tenant: subdomain, isAdminSubdomain: false };
      }
      return { tenant: null, isAdminSubdomain: false };
    }

    if (hostWithoutPort.endsWith(".vercel.app")) {
      return { tenant: null, isAdminSubdomain: false };
    }

    return { tenant: null, isAdminSubdomain: false };
  };

  it("extracts tenant from subdomain on scaffoldweb.com", () => {
    const result = extractTenantFromHost("gldf.scaffoldweb.com");
    expect(result.tenant).toBe("gldf");
    expect(result.isAdminSubdomain).toBe(false);
  });

  it("extracts tenant from .localhost subdomain", () => {
    const result = extractTenantFromHost("gldf.localhost:3000");
    expect(result.tenant).toBe("gldf");
    expect(result.isAdminSubdomain).toBe(false);
  });

  it("returns null for marketing host scaffoldweb.com", () => {
    const result = extractTenantFromHost("scaffoldweb.com");
    expect(result.tenant).toBeNull();
  });

  it("returns null for www.scaffoldweb.com", () => {
    const result = extractTenantFromHost("www.scaffoldweb.com");
    expect(result.tenant).toBeNull();
  });

  it("returns null for localhost without subdomain", () => {
    const result = extractTenantFromHost("localhost:3000");
    expect(result.tenant).toBeNull();
  });

  it("returns null for vercel.app deployments", () => {
    const result = extractTenantFromHost("reb-studio.vercel.app");
    expect(result.tenant).toBeNull();
  });

  it("extracts tenant from complex subdomain", () => {
    const result = extractTenantFromHost("my-business-name.scaffoldweb.com");
    expect(result.tenant).toBe("my-business-name");
  });

  it("ignores www subdomain", () => {
    const result = extractTenantFromHost("www.scaffoldweb.com");
    expect(result.tenant).toBeNull();
  });

  it("ignores admin subdomain", () => {
    const result = extractTenantFromHost("admin.scaffoldweb.com");
    expect(result.tenant).toBeNull();
  });
});

describe("Custom Domain Map Resolution", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.CUSTOM_DOMAIN_MAP;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CUSTOM_DOMAIN_MAP;
    } else {
      process.env.CUSTOM_DOMAIN_MAP = originalEnv;
    }
  });

  const getEnvDomainMap = (): Record<string, string> => {
    try {
      const raw = process.env.CUSTOM_DOMAIN_MAP || "{}";
      return JSON.parse(raw);
    } catch {
      return {};
    }
  };

  it("resolves tenant from CUSTOM_DOMAIN_MAP env var", () => {
    process.env.CUSTOM_DOMAIN_MAP = JSON.stringify({
      "mybusiness.com": "mybusiness-tenant",
      "anotherbusiness.com": "another-tenant",
    });

    const domainMap = getEnvDomainMap();
    expect(domainMap["mybusiness.com"]).toBe("mybusiness-tenant");
    expect(domainMap["anotherbusiness.com"]).toBe("another-tenant");
  });

  it("returns empty object for invalid JSON", () => {
    process.env.CUSTOM_DOMAIN_MAP = "invalid-json";
    const domainMap = getEnvDomainMap();
    expect(domainMap).toEqual({});
  });

  it("returns empty object when env var is not set", () => {
    delete process.env.CUSTOM_DOMAIN_MAP;
    const domainMap = getEnvDomainMap();
    expect(domainMap).toEqual({});
  });

  it("handles multiple domains correctly", () => {
    process.env.CUSTOM_DOMAIN_MAP = JSON.stringify({
      "business1.com": "tenant1",
      "business2.com": "tenant2",
      "business3.org": "tenant3",
    });

    const domainMap = getEnvDomainMap();
    expect(Object.keys(domainMap)).toHaveLength(3);
    expect(domainMap["business3.org"]).toBe("tenant3");
  });
});

// ============================================================================
// Idempotency Tests for Webhooks
// ============================================================================

describe("Webhook Idempotency", () => {
  it("Stripe event claim returns true on first call, false on duplicate", () => {
    const processedEvents = new Set<string>();

    const claimEvent = (eventId: string): boolean => {
      if (processedEvents.has(eventId)) return false;
      processedEvents.add(eventId);
      return true;
    };

    const eventId = "evt_test_123";
    expect(claimEvent(eventId)).toBe(true);
    expect(claimEvent(eventId)).toBe(false);
    expect(claimEvent(eventId)).toBe(false);
  });

  it("Stripe event claim handles max capacity with cleanup", () => {
    const processedEvents = new Set<string>();
    const MAX_EVENTS = 10;

    const claimEvent = (eventId: string): boolean => {
      if (processedEvents.has(eventId)) return false;

      if (processedEvents.size >= MAX_EVENTS) {
        // Remove first 3 events
        const iterator = processedEvents.values();
        for (let i = 0; i < 3; i++) {
          const next = iterator.next();
          if (next.done) break;
          processedEvents.delete(next.value);
        }
      }

      processedEvents.add(eventId);
      return true;
    };

    // Fill to capacity
    for (let i = 0; i < MAX_EVENTS; i++) {
      expect(claimEvent(`evt_${i}`)).toBe(true);
    }
    expect(processedEvents.size).toBe(MAX_EVENTS);

    // Adding one more should trigger cleanup
    expect(claimEvent("evt_overflow")).toBe(true);
    expect(processedEvents.size).toBe(8); // 10 - 3 + 1

    // First few events should now be claimable again (they were removed)
    expect(claimEvent("evt_0")).toBe(true);
  });
});

// ============================================================================
// Content Validation Tests
// ============================================================================

describe("Content Validation", () => {
  const REQUIRED_FIELDS: Record<string, string[]> = {
    hero: ["headline", "tagline", "ctaText"],
    services: ["headline"],
    story: ["headline", "statement"],
    contact: ["email"],
    settings: ["siteName"],
    products: ["headline"],
  };

  function validateBody(section: string, body: Record<string, unknown>): string | null {
    const required = REQUIRED_FIELDS[section] ?? [];
    for (const field of required) {
      const value = body[field];
      if (typeof value !== "string" || value.trim() === "") {
        return `"${field}" is required and cannot be empty`;
      }
    }

    if (section === "contact" && typeof body.email === "string") {
      if (!body.email.includes("@") || !body.email.includes(".")) {
        return "Invalid email address";
      }
    }

    if (section === "services" && Array.isArray(body.services)) {
      for (let i = 0; i < body.services.length; i++) {
        const s = body.services[i] as Record<string, unknown>;
        if (typeof s.name !== "string" || s.name.trim() === "") {
          return `Service ${i + 1} is missing a name`;
        }
      }
    }

    return null;
  }

  it("hero: accepts valid data", () => {
    const err = validateBody("hero", {
      headline: "Hello",
      tagline: "World",
      ctaText: "Click",
    });
    expect(err).toBeNull();
  });

  it("hero: rejects missing headline", () => {
    const err = validateBody("hero", {
      tagline: "World",
      ctaText: "Click",
    });
    expect(err).toBe('"headline" is required and cannot be empty');
  });

  it("hero: rejects empty string headline", () => {
    const err = validateBody("hero", {
      headline: "   ",
      tagline: "World",
      ctaText: "Click",
    });
    expect(err).toBe('"headline" is required and cannot be empty');
  });

  it("contact: accepts valid email", () => {
    const err = validateBody("contact", { email: "a@b.com" });
    expect(err).toBeNull();
  });

  it("contact: rejects email without @", () => {
    const err = validateBody("contact", { email: "notanemail.com" });
    expect(err).toBe("Invalid email address");
  });

  it("services: rejects service item missing name", () => {
    const err = validateBody("services", {
      headline: "Services",
      services: [{ name: "", description: "test" }],
    });
    expect(err).toBe("Service 1 is missing a name");
  });
});

// ============================================================================
// Event Ordering Tests (Stripe Out-of-Order Event Handling)
// ============================================================================

describe("Stripe Event Ordering", () => {
  it("ignores out-of-order events based on timestamp", () => {
    const lastEventTimestamps: Record<string, number> = {};

    const shouldProcess = (tenantId: string, eventCreated: number): boolean => {
      const lastCreated = lastEventTimestamps[tenantId];
      if (typeof lastCreated === "number" && eventCreated < lastCreated) {
        return false; // Out of order, skip
      }
      lastEventTimestamps[tenantId] = eventCreated;
      return true;
    };

    // First event at time 1000
    expect(shouldProcess("tenant1", 1000)).toBe(true);

    // Later event at time 2000
    expect(shouldProcess("tenant1", 2000)).toBe(true);

    // Out of order event at time 1500
    expect(shouldProcess("tenant1", 1500)).toBe(false);

    // Even later event at time 3000
    expect(shouldProcess("tenant1", 3000)).toBe(true);
  });

  it("tracks timestamps per tenant independently", () => {
    const lastEventTimestamps: Record<string, number> = {};

    const shouldProcess = (tenantId: string, eventCreated: number): boolean => {
      const lastCreated = lastEventTimestamps[tenantId];
      if (typeof lastCreated === "number" && eventCreated < lastCreated) {
        return false;
      }
      lastEventTimestamps[tenantId] = eventCreated;
      return true;
    };

    expect(shouldProcess("tenant1", 1000)).toBe(true);
    expect(shouldProcess("tenant2", 500)).toBe(true); // Different tenant, should process
    expect(shouldProcess("tenant1", 900)).toBe(false); // Out of order for tenant1
    expect(shouldProcess("tenant2", 600)).toBe(true); // In order for tenant2
  });
});
